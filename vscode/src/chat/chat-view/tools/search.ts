import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    ContextItemSource,
    PromptString,
    UIToolStatus,
    displayPath,
    firstValueFrom,
    logDebug,
    pendingOperation,
} from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import type { AgentTool } from '.'
import { getCorpusContextItemsForEditorState } from '../../initialContext'
import { type ContextRetriever, toStructuredMentions } from '../ContextRetriever'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { type CodeSearchInput, CodeSearchSchema } from './schema'

export async function getCodebaseSearchTool(
    contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
    span: Span
): Promise<AgentTool> {
    const searchTool: AgentTool = {
        spec: {
            name: 'code_search',
            description: 'Perform a keyword query search in the codebase.',
            input_schema: zodToolSchema(CodeSearchSchema),
        },
        invoke: async (input: CodeSearchInput) => {
            const startTime = Date.now()
            try {
                const validInput = validateWithZod(CodeSearchSchema, input, 'code_search')
                const corpusItems = await firstValueFrom(getCorpusContextItemsForEditorState())
                if (!corpusItems || corpusItems === pendingOperation) {
                    throw new Error('No corpus items available')
                }

                const repo = corpusItems.find(i => i.type === 'tree' || i.type === 'repository')
                const mentions = repo ? [repo] : []

                try {
                    // Local search using grep
                    if (validInput.query) {
                        logDebug('grep_search', `Searching for: ${validInput.query}`, {
                            verbose: { mentions },
                        })

                        // Perform local search
                        const searchResults = await grep(validInput.query, {
                            dir: repo?.uri.fsPath,
                        })

                        if (searchResults.length > 0) {
                            return createSearchToolStateItem(
                                validInput.query,
                                searchResults,
                                UIToolStatus.Done,
                                startTime
                            )
                        }
                    }
                } catch (error) {
                    logDebug('grep_search', `Local search failed: ${error}`, {
                        verbose: { mentions },
                    })
                }

                // If local search fails or returns no results, fallback to remote search
                try {
                    const searches = await contextRetriever.retrieveContext(
                        toStructuredMentions(mentions),
                        PromptString.unsafe_fromLLMResponse(validInput.query),
                        span,
                        // Create a new abort controller that doesn't propagate back
                        new AbortController().signal,
                        true
                    )
                    return createSearchToolStateItem(
                        validInput.query,
                        searches,
                        UIToolStatus.Done,
                        startTime
                    )
                } catch (error) {
                    // Handle error from context retrieval
                    throw new Error(`Context retrieval failed: ${error}`)
                }
            } catch (error) {
                // Handle any other errors
                return createSearchToolStateItem(
                    input.query || 'unknown query',
                    [],
                    UIToolStatus.Error,
                    startTime,
                    `Tool error: ${error}`
                )
            }
        },
    }

    return searchTool
}

export function createSearchToolStateItem(
    query: string,
    searchResults: ContextItem[],
    status: UIToolStatus = UIToolStatus.Done,
    startTime?: number,
    error?: string
): ContextItemToolState {
    // Calculate duration if we have a start time
    const duration = startTime ? Date.now() - startTime : undefined

    // Create a virtual URI for this tool state
    const uri = URI.parse(`cody:/tools/search/${query}`)

    // Create a description based on query and result count
    const description = `Search for "${query}" (${searchResults.length} results)\n`

    // Group search results by file name with code content
    const isRemoteSearch = searchResults.some(r => r?.uri?.scheme === 'http')
    const prefix = isRemoteSearch ? 'Remote search results:\n' : 'Search results:\n'
    const groupedResults =
        prefix +
        searchResults
            .map(({ uri, content }) => {
                if (!content?.length) return ''
                const remote = isRemoteSearch && uri.path?.split('/-/blob/')?.pop()
                const filePath = remote || displayPath(uri)
                return `\`\`\`${filePath}\n${content}\n\`\`\`\n`
            })
            .join('\n\n')

    return {
        type: 'tool-state',
        toolId: `search-${query}`,
        toolName: 'search',
        status,
        duration,
        outputType: 'search-result',
        searchResultItems: searchResults,

        // ContextItemCommon properties
        uri,
        content: description + groupedResults + error,
        title: query,
        description,
        source: ContextItemSource.Agentic,
        icon: 'search',
        metadata: [
            `Query: ${query}`,
            `Results: ${searchResults.length}`,
            `Status: ${status}`,
            ...(duration ? [`Duration: ${duration}ms`] : []),
        ],
    }
}

let useRipGrep: boolean | undefined = undefined

// Check if ripgrep can be used for searching.
async function isRipGrepAvailabile(): Promise<boolean> {
    if (useRipGrep === undefined) {
        try {
            const { stdout } = await promisify(exec)('rg --version')
            useRipGrep = stdout.includes('ripgrep')
        } catch {
            useRipGrep = false
        }
        logDebug('grep_search', useRipGrep ? 'use ripgrep' : 'ripgrep not found')
    }
    return useRipGrep
}

const SEARCH_COMMAND_TEMPLATES = {
    rg: 'rg "{{KEYWORD}}" {{DIR}} --line-number --heading --smart-case',
    grep: 'grep "{{KEYWORD}}" {{DIR}} -r -n',
}

async function grep(
    keyword: string,
    options: {
        dir?: string
        includePattern?: string
        excludePattern?: string
    }
): Promise<ContextItem[]> {
    try {
        logDebug('grep_search', `Searching for: ${keyword}`)
        // Check if ripgrep availability has been determined
        if (useRipGrep === undefined) {
            await isRipGrepAvailabile()
        }
        // Use workspace root directory if not specified
        const dir =
            options.dir || vscode.workspace.workspaceFolders?.[0]?.uri?.toString() || process.cwd()
        try {
            const execPromise = promisify(exec)
            const template = useRipGrep ? SEARCH_COMMAND_TEMPLATES.rg : SEARCH_COMMAND_TEMPLATES.grep
            const command = template.replace('{{KEYWORD}}', keyword).replace('{{DIR}}', dir ?? '')
            const { stdout, stderr } = await execPromise(command)
            logDebug('grep_search', `Searched for ${keyword}`, { verbose: { stdout, stderr } })
            // Break down the output into context items
            const searches: ContextItem[] = []
            const lines = stdout.split('\n')
            for (const line of lines) {
                if (!line.trim()) continue // Skip empty lines
                // Extract file path and line number
                const match = line.match(/^(.*?):(\d+):(.*)$/)
                if (match) {
                    const filePath = match[1]
                    const lineNumber = Number.parseInt(match[2], 10)
                    const lineText = match[3].trim()
                    // Create a ContextItemToolState for each match
                    searches.push({
                        type: 'file',
                        uri: URI.file(filePath),
                        title: filePath,
                        description: `Line ${lineNumber}`,
                        content: lineText,
                        source: ContextItemSource.Search,
                        range: {
                            start: { line: lineNumber - 1, character: 0 }, // 0-based index
                            end: { line: lineNumber - 1, character: lineText.length },
                        },
                    } satisfies ContextItem)
                }
                return searches
            }
        } catch (error) {
            throw new Error(`Grep search failed: ${error}`)
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error : new Error('Unknown error')
        throw new Error(`Grep search failed: ${errorMsg}`)
    }
    return []
}

/**
 * Search for a term in the workspace files using VSCode's file search capabilities.
 * This function searches for the term in all files that match the include pattern
 * and are not excluded by the exclude pattern.
 * @param term The search term to look for
 * @param options Search options
 * @returns Array of search results with file paths and matching lines
 */
export async function vscodeSearch(
    term: string,
    options: {
        includePattern?: string
        excludePattern?: string
        directory?: string
        caseSensitive?: boolean
        maxResults?: number
    } = {}
): Promise<Array<{ uri: vscode.Uri; lineNumber: number; lineText: string }>> {
    if (!term || term.trim() === '') {
        throw new Error('Search term is required')
    }
    try {
        logDebug('file_operations', `Searching for: ${term}`)
        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder is open')
        }
        // Determine search directory
        let searchDir = workspaceFolder
        if (options.directory) {
            const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, options.directory)
            try {
                // Check if directory exists
                await vscode.workspace.fs.stat(dirUri)
                // Create a custom workspace folder for the search
                searchDir = {
                    uri: dirUri,
                    name: options.directory.split('/').pop() || options.directory,
                    index: 0,
                }
            } catch (error) {
                throw new Error(`Directory not found: ${options.directory}`)
            }
        }
        // Create search pattern
        const searchPattern = new vscode.RelativePattern(searchDir, '**/*')
        // Find all files that match the include pattern
        const files = await vscode.workspace.findFiles(
            options.includePattern ? options.includePattern : searchPattern,
            options.excludePattern,
            options.maxResults
        )
        logDebug('file_operations', `Found ${files.length} files to search in`)
        // Search for the term in each file
        const searchResults: Array<{ uri: vscode.Uri; lineNumber: number; lineText: string }> = []
        for (const fileUri of files) {
            try {
                const document = await vscode.workspace.openTextDocument(fileUri)
                const fileContent = document.getText()
                // Create a regex for the search term
                const regex = new RegExp(
                    term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), // Escape special characters
                    options.caseSensitive ? 'g' : 'gi'
                )
                let match: RegExpExecArray | null
                match = regex.exec(fileContent)
                while (match !== null) {
                    const position = document.positionAt(match.index)
                    const lineNumber = position.line
                    const lineText = document.lineAt(lineNumber).text

                    searchResults.push({
                        uri: fileUri,
                        lineNumber,
                        lineText,
                    })
                    // Limit results if maxResults is specified
                    if (options.maxResults && searchResults.length >= options.maxResults) {
                        break
                    }

                    match = regex.exec(fileContent)
                }
            } catch (error) {
                // Skip files that can't be read
                logDebug('file_operations', `Error reading file ${fileUri.toString()}: ${error}`)
                continue
            }
            // Limit results if maxResults is specified
            if (options.maxResults && searchResults.length >= options.maxResults) {
                break
            }
        }
        logDebug('file_operations', `Found ${searchResults.length} results for term: ${term}`)
        return searchResults
    } catch (error: any) {
        logDebug('file_operations', `Error searching for term "${term}": ${error.message}`)
        throw new Error(`Failed to search files: ${error.message}`)
    }
}
