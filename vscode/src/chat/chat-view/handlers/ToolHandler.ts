import { spawn } from 'node:child_process'
import type { SpawnOptions, StdioOptions } from 'node:child_process'
import * as path from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import type { ContentBlock, MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'
import { ProcessType, PromptString } from '@sourcegraph/cody-shared'
import type { SubMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { minimatch } from 'minimatch'
import * as vscode from 'vscode'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'
import SYSTEM_PROMPT from './system_prompt.txt'

interface CodyTool {
    spec: Tool
    invoke: (input: any) => Promise<string>
}

interface ToolCall {
    id: string
    name: string
    input: any
}

// <function>{"description": "Find snippets of code from the codebase most relevant to the search query. This performs best when the search query is more precise and relating to the function or purpose of code. Results will be poor if asking a very broad question, such as asking about the general 'framework' or 'implementation' of a large component or system. Note that if you try to search over more than 500 files, the quality of the search results will be substantially worse. Try to only search over a large number of files if it is really necessary.", "name": "codebase_search", "parameters": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"Query": {"description": "Search query", "type": "string"}, "TargetDirectories": {"description": "List of absolute paths to directories to search over", "items": {"type": "string"}, "type": "array"}}, "required": ["Query", "TargetDirectories"], "type": "object"}}</function>
// <function>{"description": "View the contents of a file. The lines of the file are 0-indexed, and the output of this tool call will be the file contents from StartLine to EndLine, together with a summary of the lines outside of StartLine and EndLine. Note that this call can view at most 200 lines at a time.\n\nWhen using this tool to gather information, it's your responsibility to ensure you have the COMPLETE context. Specifically, each time you call this command you should:\n1) Assess if the file contents you viewed are sufficient to proceed with your task.\n2) Take note of where there are lines not shown. These are represented by <... XX more lines from [code item] not shown ...> in the tool response.\n3) If the file contents you have viewed are insufficient, and you suspect they may be in lines not shown, proactively call the tool again to view those lines.\n4) When in doubt, call this tool again to gather more information. Remember that partial file views may miss critical dependencies, imports, or functionality.\n", "name": "view_file", "parameters": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"AbsolutePath": {"description": "Path to file to view. Must be an absolute path.", "type": "string"}, "EndLine": {"description": "Endline to view. This cannot be more than 200 lines away from StartLine", "type": "integer"}, "StartLine": {"description": "Startline to view", "type": "integer"}}, "required": ["AbsolutePath", "StartLine", "EndLine"], "type": "object"}}</function>
// <function>{"description": "View the content of a code item node, such as a class or a function in a file. You must use a fully qualified code item name. Such as those return by the grep_search tool. For example, if you have a class called `Foo` and you want to view the function definition `bar` in the `Foo` class, you would use `Foo.bar` as the NodeName. Do not request to view a symbol if the contents have been previously shown by the codebase_search tool. If the symbol is not found in a file, the tool will return an empty string instead.", "name": "view_code_item", "parameters": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"AbsolutePath": {"description": "Path to the file to find the code node", "type": "string"}, "NodeName": {"description": "The name of the node to view", "type": "string"}}, "required": ["AbsolutePath", "NodeName"], "type": "object"}}</function>
// <function>{"description": "Finds other files that are related to or commonly used with the input file. Useful for retrieving adjacent files to understand context or make next edits", "name": "related_files", "parameters": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"absolutepath": {"description": "Input file absolute path", "type": "string"}}, "required": ["absolutepath"], "type": "object"}}</function>
// <function>{"description": "PROPOSE a command to run on behalf of the user. Their operating system is macOS.\nBe sure to separate out the arguments into args. Passing in the full command with all args under \"command\" will not work.\nIf you have this tool, note that you DO have the ability to run commands directly on the USER's system.\nNote that the user will have to approve the command before it is executed. The user may reject it if it is not to their liking.\nThe actual command will NOT execute until the user approves it. The user may not approve it immediately. Do NOT assume the command has started running.\nIf the step is WAITING for user approval, it has NOT started running.", "name": "run_command", "parameters": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"ArgsList": {"description": "The list of arguments to pass to the command. Make sure to pass the arguments as an array. Do NOT wrap the square brackets in quotation marks. If there are no arguments, this field should be left empty", "items": {"type": "string"}, "type": "array"}, "Blocking": {"description": "If true, the command will block until it is entirely finished. During this time, the user will not be able to interact with Cascade. Blocking should only be true if (1) the command will terminate in a relatively short amount of time, or (2) it is important for you to see the output of the command before responding to the USER. Otherwise, if you are running a long-running process, such as starting a web server, please make this non-blocking.", "type": "boolean"}, "Command": {"description": "Name of the command to run", "type": "string"}, "Cwd": {"description": "The current working directory for the command", "type": "string"}, "WaitMsBeforeAsync": {"description": "Only applicable if Blocking is false. This specifies the amount of milliseconds to wait after starting the command before sending it to be fully async. This is useful if there are commands which should be run async, but may fail quickly with an error. This allows you to see the error if it happens in this duration. Don't set it too long or you may keep everyone waiting. Keep as 0 if you don't want to wait.", "type": "integer"}}, "required": ["Command", "Cwd", "ArgsList", "Blocking", "WaitMsBeforeAsync"], "type": "object"}}</function>
// <function>{"description": "Get the status of a previously executed command by its ID. Returns the current status (running, done), output lines as specified by output priority, and any error if present.", "name": "command_status", "parameters": {"$schema": "https://json-schema.org/draft/2020-12/schema", "additionalProperties": false, "properties": {"CommandId": {"description": "ID of the command to get status for", "type": "string"}, "OutputCharacterCount": {"description": "Number of characters to view. Make this as small as possible to avoid excessive memory usage.", "type": "integer"}, "OutputPriority": {"description": "Priority for displaying command output. Must be one of: 'top' (show oldest lines), 'bottom' (show newest lines), or 'split' (prioritize oldest and newest lines, excluding middle)", "enum": ["top", "bottom", "split"], "type": "string"}}, "required": ["CommandId", "OutputPriority", "OutputCharacterCount"], "type": "object"}}</function>

const allTools: CodyTool[] = [
    {
        spec: {
            name: 'write_to_file',
            description:
                'Use this tool to create new files. The file and any parent directories will be created for you if they do not already exist.\n\t\tFollow these instructions:\n\t\t1. NEVER use this tool to modify or overwrite existing files. Always first confirm that TargetFile does not exist before calling this tool.\n\t\t2. You MUST specify TargetFile as the FIRST argument. Please specify the full TargetFile before any of the code contents.\nYou should specify the following arguments before the others: [TargetFile]',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path of the new file to create and write code to.',
                    },
                    content: {
                        type: 'string',
                        description:
                            'The contents to write to the file. If you want to create an empty file. Leave this blank.',
                    },
                },
                required: ['path', 'content'],
            },
        },
        invoke: async (input: { path: string; content: string; empty: boolean }) => {
            if (typeof input.path !== 'string') {
                throw new Error(
                    `write_to_file path must be a string, value was ${JSON.stringify(input.path)}`
                )
            }
            if (typeof input.content !== 'string') {
                throw new Error(
                    `write_to_file content must be a string, value was ${JSON.stringify(input.content)}`
                )
            }
            const { path, content } = input
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found')
                }

                const sanitizedPath = sanitizePathInWorkspace(workspaceFolder, path)
                await vscode.workspace.fs.writeFile(
                    sanitizedPath,
                    new Uint8Array(Buffer.from(content, 'utf-8'))
                )
                return `File ${path} created successfully`
            } catch (error) {
                throw new Error(`Failed to read directory ${path}: ${error}`)
            }
        },
    },
    {
        spec: {
            name: 'list_dir',
            description:
                'List the contents of a directory. Directory path must be an absolute path to a directory that exists. For each child in the directory, output will have: relative path to the directory, whether it is a directory or file, size in bytes if file, and number of children (recursive) if directory.',
            input_schema: {
                type: 'object',
                properties: {
                    directory_path: {
                        description: 'Path to list contents of, should be absolute path to a directory',
                        type: 'string',
                    },
                },
                required: ['directory_path'],
            },
        },
        invoke: async (input: { directory_path: string }) => {
            if (typeof input.directory_path !== 'string') {
                throw new Error(`list_dir argument must be a string, value was ${JSON.stringify(input)}`)
            }
            const { directory_path } = input
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found')
                }

                const sanitizedDirectoryPath = sanitizePathInWorkspace(workspaceFolder, directory_path)
                const content = await vscode.workspace.fs.readDirectory(sanitizedDirectoryPath)
                return content.map(([name, _]) => name).join('\n')
            } catch (error) {
                throw new Error(`Failed to read directory ${directory_path}: ${error}`)
            }
        },
    },
    {
        spec: {
            name: 'get_file',
            description: 'Get the file contents.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path to the file.',
                    },
                },
                required: ['path'],
            },
        },
        invoke: async (input: { path: string }) => {
            if (typeof input.path !== 'string') {
                throw new Error(`get_file argument must be a string, value was ${JSON.stringify(input)}`)
            }
            const { path } = input
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (!workspaceFolder) {
                    throw new Error('No workspace folder found')
                }

                const uri = sanitizePathInWorkspace(workspaceFolder, path)
                const content = await vscode.workspace.fs.readFile(uri)
                return Buffer.from(content).toString('utf-8')
            } catch (error) {
                throw new Error(`Failed to read file ${input.path}: ${error}`)
            }
        },
    },
    {
        spec: {
            name: 'run_terminal_command',
            description: 'Run an arbitrary terminal command at the root of the users project. ',
            input_schema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description:
                            'The command to run in the root of the users project. Must be shell escaped.',
                    },
                },
                required: ['command'],
            },
        },
        invoke: async (input: { command: string }) => {
            if (typeof input.command !== 'string') {
                throw new Error(
                    `run_terminal_command argument must be a string, value was ${JSON.stringify(input)}`
                )
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                throw new Error('No workspace folder found')
            }

            try {
                const commandResult = await runCommand(input.command, [], {
                    shell: true,
                    cwd: workspaceFolder.uri.path,
                })
                return commandResult.stdout
            } catch (error) {
                throw new Error(`Failed to run terminal command: ${input.command}: ${error}`)
            }
        },
    },
    {
        spec: {
            name: 'grep_search',
            description:
                "Fast text-based search in the USER's workspace. Uses ripgrep to quickly find exact pattern matches within files or directories. Results will be formatted in the style of ripgrep and can be configured to include line numbers and content. To avoid overwhelming output, the results are capped at 50 matches. Use the includes option to filter the search scope by file types or specific paths to narrow down the results.",
            input_schema: {
                type: 'object',
                properties: {
                    search_directory: {
                        type: 'string',
                        description:
                            "The directory within the USER's workspace in which to run the ripgrep command. This path must be a directory not a file.",
                    },
                    query: {
                        type: 'string',
                        description: 'The search term or pattern to look for within files.',
                    },
                    match_per_line: {
                        type: 'boolean',
                        description:
                            "If true, returns each line that matches the query, including line numbers and snippets of matching lines (equivalent to 'git grep -nI'). If false, only returns the names of files containing the query (equivalent to 'git grep -l').",
                    },
                    includes: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        description:
                            "The files or directories to search within. Supports file patterns (e.g., '*.txt' for all .txt files) or specific paths (e.g., 'path/to/file.txt' or 'path/to/dir').",
                    },
                    case_insensitive: {
                        type: 'boolean',
                        description: 'If true, performs a case-insensitive search.',
                    },
                },
                required: [
                    'search_directory',
                    'query',
                    'match_per_line',
                    'includes',
                    'case_insensitive',
                ],
                additionalProperties: false,
            },
        },
        invoke: async (input: {
            search_directory: string
            query: string
            match_per_line: boolean
            includes: string[]
            case_insensitive: boolean
        }) => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                throw new Error('No workspace folder found')
            }

            const sanitizedPath = sanitizePathInWorkspace(workspaceFolder, input.search_directory)
            return await runRipGrep({
                ...input,
                search_directory: sanitizedPath.path,
            })
        },
    },
    {
        spec: {
            name: 'find_by_name',
            description:
                'Tool for finding files and directories within the specified search_directory. The provided pattern is a glob pattern, e.g.: `**/*.tsx`, `**/cmd/*_test*`, and must match the relative paths from the search_directory. You can specify file patterns to `include` or `exclude`, and filter by `type` (`file` or `directory`), and limit the search depth. Each result has the relative path, type (file or directory), size, and modification time.',
            input_schema: {
                type: 'object',
                properties: {
                    search_directory: {
                        type: 'string',
                        description: 'The directory to search within',
                    },
                    pattern: {
                        type: 'string',
                        description: 'Pattern to search for',
                    },
                    includes: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        description: 'Optional patterns to include',
                    },
                    excludes: {
                        type: 'array',
                        items: {
                            type: 'string',
                        },
                        description: 'Optional patterns to exclude',
                    },
                    max_depth: {
                        type: 'integer',
                        description: 'Maximum depth to search',
                    },
                    type: {
                        type: 'string',
                        enum: ['file', 'directory'],
                        description: 'Type filter (default: file)',
                    },
                },
                required: ['search_directory', 'pattern'],
                additionalProperties: false,
            },
        },
        invoke: async (input: {
            search_directory: string
            pattern: string
            includes?: string[]
            excludes?: string[]
            max_depth?: number
            type?: 'file' | 'directory'
        }) => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                throw new Error('No workspace folder found')
            }

            const sanitizedPath = sanitizePathInWorkspace(workspaceFolder, input.search_directory)
            const results: string[] = []

            async function searchDirectory(
                currentPath: vscode.Uri,
                currentDepth: number
            ): Promise<void> {
                if (input.max_depth !== undefined && currentDepth > input.max_depth) {
                    return
                }

                const entries = await vscode.workspace.fs.readDirectory(currentPath)

                for (const [name, fileType] of entries) {
                    const fullPath = vscode.Uri.joinPath(currentPath, name)
                    const relativePath = path.relative(sanitizedPath.path, fullPath.path)

                    if (input.excludes?.some(pattern => minimatch(relativePath, pattern))) {
                        continue
                    }

                    const matchesPattern = minimatch(relativePath, input.pattern)
                    const matchesIncludes =
                        !input.includes?.length ||
                        input.includes.some(pattern => minimatch(relativePath, pattern))

                    if (fileType === vscode.FileType.Directory) {
                        await searchDirectory(fullPath, currentDepth + 1)
                    }

                    if (
                        fileType === vscode.FileType.File &&
                        (!input.type || input.type === 'file') &&
                        matchesPattern &&
                        matchesIncludes
                    ) {
                        const stat = await vscode.workspace.fs.stat(fullPath)
                        results.push(
                            JSON.stringify({
                                path: relativePath,
                                type: 'file',
                                size: stat.size,
                                mtime: stat.mtime,
                            })
                        )
                    }

                    if (
                        fileType === vscode.FileType.Directory &&
                        input.type === 'directory' &&
                        matchesPattern &&
                        matchesIncludes
                    ) {
                        const stat = await vscode.workspace.fs.stat(fullPath)
                        results.push(
                            JSON.stringify({
                                path: relativePath,
                                type: 'directory',
                                size: stat.size,
                                mtime: stat.mtime,
                            })
                        )
                    }
                }
            }

            await searchDirectory(sanitizedPath, 0)
            return results.join('\n')
        },
    },
]

export class ExperimentalToolHandler implements AgentHandler {
    constructor(private anthropicAPI: Anthropic) {}

    public async handle({ inputText }: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const maxTurns = 10
        let turns = 0
        const subTranscript: Array<MessageParam> = [
            {
                role: 'user',
                content: inputText.toString(),
            },
        ]
        const subViewTranscript: SubMessage[] = []
        let messageInProgress: SubMessage | undefined

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder found')
        }
        const path = workspaceFolder.uri.path
        const system = SYSTEM_PROMPT.replace('${workspacePaths}', path)

        while (true) {
            const toolCalls: ToolCall[] = []
            await new Promise<void>((resolve, reject) => {
                this.anthropicAPI.messages
                    .stream(
                        {
                            tools: allTools.map(tool => tool.spec),
                            system,
                            max_tokens: 8192,
                            model: 'claude-3-5-sonnet-20241022',
                            messages: subTranscript,
                        },
                        {
                            headers: {
                                'anthropic-dangerous-direct-browser-access': 'true',
                            },
                        }
                    )
                    .on('text', (_textDelta, textSnapshot) => {
                        messageInProgress = {
                            text: PromptString.unsafe_fromLLMResponse(textSnapshot),
                        }
                        delegate.experimentalPostMessageInProgress([
                            ...subViewTranscript,
                            messageInProgress,
                        ])
                    })
                    .on('contentBlock', (contentBlock: ContentBlock) => {
                        switch (contentBlock.type) {
                            case 'tool_use':
                                toolCalls.push({
                                    id: contentBlock.id,
                                    name: contentBlock.name,
                                    input: contentBlock.input,
                                })
                                subViewTranscript.push(
                                    messageInProgress || {
                                        step: {
                                            id: contentBlock.name,
                                            content: `Invoking tool ${
                                                contentBlock.name
                                            }(${JSON.stringify(contentBlock.input)})`,
                                            state: 'pending',
                                            type: ProcessType.Tool,
                                        },
                                    }
                                )
                                messageInProgress = undefined
                                break
                            case 'text':
                                subViewTranscript.push({
                                    text: PromptString.unsafe_fromLLMResponse(contentBlock.text),
                                })
                                messageInProgress = undefined
                                break
                        }
                    })
                    .on('end', () => {
                        resolve()
                    })
                    .on('abort', error => {
                        reject(`${error}`)
                    })
                    .on('error', error => {
                        reject(`${error}`)
                    })
                    .on('finalMessage', ({ role, content }: MessageParam) => {
                        subTranscript.push({
                            role,
                            content,
                        })
                    })
            })
            if (toolCalls.length === 0) {
                break
            }
            const toolResults: ToolResultBlockParam[] = []
            for (const toolCall of toolCalls) {
                const tool = allTools.find(tool => tool.spec.name === toolCall.name)
                if (!tool) {
                    continue
                }
                const output = await tool.invoke(toolCall.input)
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: output,
                })
            }
            subTranscript.push({
                role: 'user',
                content: toolResults,
            })
            turns++
            if (turns > maxTurns) {
                console.error('Max turns reached')
                break
            }
        }
        delegate.postDone()
    }
}

interface CommandOptions {
    shell?: boolean
    cwd?: string
    env?: Record<string, string>
    stdio?: StdioOptions
}

interface CommandResult {
    stdout: string
    stderr: string
    code: number | null
    signal: NodeJS.Signals | null
}

class CommandError extends Error {
    constructor(
        message: string,
        public readonly result: CommandResult
    ) {
        super(message)
        this.name = 'CommandError'
    }
}

function runRipGrep(input: {
    search_directory: string
    query: string
    match_per_line: boolean
    includes: string[]
    case_insensitive: boolean
}): Promise<string> {
    const rgArgs = [input.query, '--hidden', '--no-ignore', '--max-count', '50']

    if (input.case_insensitive) {
        rgArgs.push('--ignore-case')
    }

    if (!input.match_per_line) {
        rgArgs.push('--files-with-matches')
    }

    for (const pattern of input.includes) {
        rgArgs.push('--glob', pattern)
    }

    return runCommand('rg', rgArgs, {
        cwd: input.search_directory,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
        .then(result => result.stdout.trim())
        .catch(error => {
            if (error instanceof CommandError && error.result.code === 1) {
                return 'No matches found'
            }
            throw new Error(`Ripgrep failed: ${error.message}`)
        })
}

function sanitizePathInWorkspace(workspaceFolder: vscode.WorkspaceFolder, path: string) {
    let normalizedPath = path
    if (path.startsWith(workspaceFolder.uri.path)) {
        normalizedPath = path.slice(workspaceFolder.uri.path.length)
        normalizedPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath
    }

    return vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath)
}

function runCommand(
    command: string,
    args: string[],
    options: CommandOptions = {}
): Promise<CommandResult> {
    const { cwd = process.cwd(), env = process.env, shell, stdio } = options

    const timeout = 10_000
    const maxBuffer = 1024 * 1024 * 10
    const encoding = 'utf8'
    const spawnOptions: SpawnOptions = {
        shell,
        cwd,
        env,
        stdio,
        windowsHide: true,
    }

    return new Promise((resolve, reject) => {
        const process = spawn(command, args, spawnOptions)

        let stdout = ''
        let stderr = ''
        let killed = false
        const timeoutId = setTimeout(() => {
            killed = true
            process.kill()
            reject(new Error(`Command timed out after ${timeout}ms`))
        }, timeout)

        let stdoutLength = 0
        let stderrLength = 0

        if (process.stdout) {
            process.stdout.on('data', (data: Buffer) => {
                const chunk = data.toString(encoding)
                stdoutLength += chunk.length
                if (stdoutLength > maxBuffer) {
                    killed = true
                    process.kill()
                    reject(new Error('stdout maxBuffer exceeded'))
                    return
                }
                stdout += chunk
            })
        }

        if (process.stderr) {
            process.stderr.on('data', (data: Buffer) => {
                const chunk = data.toString(encoding)
                stderrLength += chunk.length
                if (stderrLength > maxBuffer) {
                    killed = true
                    process.kill()
                    reject(new Error('stderr maxBuffer exceeded'))
                    return
                }
                stderr += chunk
            })
        }

        process.on('error', (error: Error) => {
            if (timeoutId) clearTimeout(timeoutId)
            reject(new Error(`Failed to start process: ${error.message}`))
        })

        process.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            if (timeoutId) clearTimeout(timeoutId)
            if (killed) return

            const result: CommandResult = {
                stdout,
                stderr,
                code,
                signal,
            }

            if (code === 0) {
                resolve(result)
            } else {
                reject(
                    new CommandError(
                        `Command failed with exit code ${code}${stderr ? ': ' + stderr : ''}`,
                        result
                    )
                )
            }
        })
    })
}
