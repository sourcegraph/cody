import {
    type CandidateRule,
    type RuleProvider,
    abortableOperation,
    debounceTime,
    defer,
    fromVSCodeEvent,
    isRuleFilename,
    logDebug,
    merge,
    parseRuleFile,
    pathFunctionsForURI,
    ruleSearchPaths,
    shareReplay,
    startWith,
} from '@sourcegraph/cody-shared'
import { type Observable, filter } from 'observable-fns'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

function isRuleFile(uri: URI): boolean {
    return uri.path.endsWith('.rule.md')
}

/**
 * An Observable that fires when the user interactively creates, edits, or deletes a
 * `.sourcegraph/*.rule.md` file.
 */
const ruleFileInteractiveChanges: Observable<void> = defer(() =>
    merge(
        merge(
            fromVSCodeEvent(vscode.workspace.onDidCreateFiles),
            fromVSCodeEvent(vscode.workspace.onDidDeleteFiles)
        ).pipe(filter(e => e.files.some(isRuleFile))),
        fromVSCodeEvent(vscode.workspace.onDidChangeTextDocument).pipe(
            filter(e => isRuleFile(e.document.uri))
        )
    ).pipe(debounceTime(1000))
)

const workspaceFoldersChanges: Observable<unknown> = defer(() =>
    fromVSCodeEvent(vscode.workspace.onDidChangeWorkspaceFolders)
)

/**
 * A {@link RuleProvider} that searches the file system (using the VS Code file system API).
 */
export function createFileSystemRuleProvider(): RuleProvider {
    return {
        candidateRulesForPaths(files: URI[]): Observable<CandidateRule[]> {
            const searchPathsForFiles = new Map<
                string /* searchPath */,
                URI[] /* applies to resources */
            >()

            // Use shareReplay to ensure we don't create multiple subscriptions to the same source
            return merge(ruleFileInteractiveChanges, workspaceFoldersChanges).pipe(
                startWith(undefined),
                // Add debounce to reduce frequency of filesystem operations
                debounceTime(1000),
                abortableOperation(async (_, parentSignal) => {
                    // Create a child controller that will be aborted when parent is aborted
                    const controller = new AbortController()
                    const signal = controller.signal

                    // Set up abort propagation
                    if (parentSignal) {
                        // If parent is already aborted, abort child immediately
                        if (parentSignal.aborted) {
                            controller.abort()
                        } else {
                            // Otherwise, set up a listener to propagate abort
                            const abortHandler = (): void => {
                                parentSignal.removeEventListener('abort', abortHandler)
                                controller.abort()
                            }
                            parentSignal.addEventListener('abort', abortHandler)
                        }
                    }
                    for (const uri of files) {
                        // Do not search for rules outside of a workspace folder.
                        const root = vscode.workspace.getWorkspaceFolder(uri)
                        if (!root) {
                            continue
                        }
                        const searchPaths = ruleSearchPaths(uri, root.uri)
                        for (const searchPath of searchPaths) {
                            const appliesToResources =
                                searchPathsForFiles.get(searchPath.toString()) ?? []
                            appliesToResources.push(uri)
                            searchPathsForFiles.set(searchPath.toString(), appliesToResources)
                        }
                    }

                    const results = await Promise.all(
                        Array.from(searchPathsForFiles.entries()).map(
                            async ([searchPathStr, appliesToFiles]): Promise<CandidateRule[]> => {
                                appliesToFiles.sort()
                                const searchPath = URI.parse(searchPathStr)
                                const pathFuncs = pathFunctionsForURI(searchPath)
                                try {
                                    // Check for cancellation before starting file operations
                                    if (signal?.aborted) {
                                        return []
                                    }

                                    // Wrap directory reading in its own try/catch
                                    let entries: [string, vscode.FileType][]
                                    try {
                                        entries = await vscode.workspace.fs.readDirectory(searchPath)
                                    } catch (dirError) {
                                        // Handle directory read errors gracefully
                                        logDebug(
                                            'rules',
                                            `Error reading directory ${searchPath}: ${dirError}`
                                        )
                                        return []
                                    }

                                    // Check for cancellation after expensive operation
                                    if (signal?.aborted) {
                                        return []
                                    }

                                    const rootFolder = vscode.workspace.getWorkspaceFolder(searchPath)
                                    // There should always be a root since we checked it above, but
                                    // be defensive.
                                    if (!rootFolder) {
                                        return []
                                    }
                                    const root = rootFolder.uri

                                    const ruleFiles = entries.filter(([name]) => isRuleFilename(name))

                                    // Process files one by one with individual error handling
                                    const rules: CandidateRule[] = []
                                    for (const [name] of ruleFiles) {
                                        // Check for cancellation before each file operation
                                        if (signal?.aborted) {
                                            break
                                        }

                                        try {
                                            const ruleURI = searchPath.with({
                                                path: pathFuncs.resolve(searchPath.path, name),
                                            })
                                            const content = await vscode.workspace.fs.readFile(ruleURI)

                                            // Check for cancellation after file read
                                            if (signal?.aborted) {
                                                break
                                            }

                                            const rule = parseRuleFile(
                                                ruleURI,
                                                root,
                                                new TextDecoder().decode(content)
                                            )
                                            rules.push({
                                                rule,
                                                appliesToFiles,
                                            })
                                        } catch (fileError) {
                                            // Log but continue with other files
                                            logDebug(
                                                'rules',
                                                `Error reading rule file ${name}: ${fileError}`
                                            )
                                        }
                                    }
                                    return rules
                                } catch (error) {
                                    if (
                                        !(
                                            error &&
                                            typeof error === 'object' &&
                                            'code' in error &&
                                            error.code === 'FileNotFound'
                                        )
                                    ) {
                                        logDebug(
                                            'rules',
                                            `Error reading rules for ${searchPath}: ${error}`
                                        )
                                    }
                                    return []
                                }
                            }
                        )
                    )
                    // Check for final cancellation before returning results
                    if (signal?.aborted) {
                        return []
                    }
                    return results.flat()
                }),
                // Share the same observable among multiple subscribers
                shareReplay()
            )
        },
    }
}
