import { displayPath, logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { zodToAnthropicSchema } from '../chat-view/handlers/AgenticAnthropicHandler'
import { getDiagnosticsDiff } from './diagnostic'
import { type EditToolInput, EditToolSchema, validateWithZod } from './schema'

// NOTE: WIP - between this and the CheckpointManager, decide on a single source of truth for history

const INLINE_CONTEXT_TEMPLATE = '\n```{{FILE_NAME}}\n{{FILE_CONTENT}}\n```\n'

function getContentTemplate(file: string, content: string): string {
    return INLINE_CONTEXT_TEMPLATE.replace('{{FILE_NAME}}', file).replace('{{FILE_CONTENT}}', content)
}

let editSourceControl: vscode.SourceControl | undefined
let editHistoryGroup: vscode.SourceControlResourceGroup | undefined

// Store history items with content in query param and timestamp in fragment
const historyStore = new Map<string, { content: string; timestamp: number; uri: vscode.Uri }>()

export function initializeEditSourceControl(context: vscode.ExtensionContext): void {
    editSourceControl = vscode.scm.createSourceControl(
        'codyEditHistory',
        'Cody Edit History',
        vscode.workspace.workspaceFolders?.[0]?.uri
    )
    editHistoryGroup = editSourceControl.createResourceGroup('history', 'Edit History')
    editHistoryGroup.hideWhenEmpty = true

    // Register proper listeners for SCM and text changes
    // 1. Listen for source control resource state changes (when user discards in SCM UI)
    const disposableScm = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return

        // Check if any history items exist for the current file
        const uri = editor.document.uri

        // When file changes, check if there's a diff between content and any history items
        // If content changed and matches original, user may have discarded changes
        setTimeout(async () => {
            try {
                const historyItem = historyStore.get(uri.toString())
                if (historyItem) {
                    const currentContent = editor.document.getText()
                    // If current file content matches the history item's original content
                    // it likely means changes were discarded
                    if (currentContent === historyItem.content) {
                        historyStore.delete(uri.toString())
                        updateEditHistoryGroup()
                    }
                }
            } catch (error) {
                // Ignore errors here
            }
        }, 200) // Small delay to ensure content is updated
    })

    // 2. Register direct SCM discard command listener
    const disposableDiscard = vscode.commands.registerCommand(
        'cody.discardHistoryItem',
        (resource: EditHistoryResourceState) => {
            if (resource?.uri) {
                historyStore.delete(resource.uri.toString())
                updateEditHistoryGroup()
            }
        }
    )

    context.subscriptions.push(disposableScm, disposableDiscard)

    editSourceControl.quickDiffProvider = {
        provideOriginalResource: async (uri: vscode.Uri): Promise<vscode.Uri | null> => {
            const historyItem = historyStore.get(uri.toString())
            if (historyItem) {
                // Need to register a text document content provider to handle this URI scheme
                return uri.with({ scheme: 'cody-checkpoint' })
            }
            return null
        },
    }
    context.subscriptions.push(
        editSourceControl,
        // Register text document content provider for history diffs
        vscode.workspace.registerTextDocumentContentProvider('cody-checkpoint', {
            provideTextDocumentContent: (uri: vscode.Uri): string => {
                const originalFilePath = uri.path
                const historyItem = Array.from(historyStore.values()).find(
                    item => vscode.Uri.file(item.uri.path).path === originalFilePath
                )
                return historyItem?.content || ''
            },
        }),
        // command to open diff view
        vscode.commands.registerCommand(
            'cody.editHistory.showDiff',
            async (resource: EditHistoryResourceState) => {
                if (resource) {
                    const historyUri = resource.uri.with({ scheme: 'cody-checkpoint' })
                    const title = `History: ${displayPath(resource.uri)} (${new Date(
                        resource.timestamp
                    ).toLocaleString()})`
                    await vscode.commands.executeCommand('vscode.diff', historyUri, resource.uri, title)
                }
            }
        ),
        vscode.commands.registerCommand(
            'cody.editHistory.revert',
            async (resource: EditHistoryResourceState) => {
                if (resource) {
                    await deleteEditHistoryItem(
                        resource.uri,
                        resource.content,
                        new Date(resource.timestamp).toLocaleString()
                    )
                }
            }
        ),
        // Add context menu command for discarding history items
        vscode.commands.registerCommand(
            'cody.editHistory.discard',
            async (resource: EditHistoryResourceState) => {
                if (resource?.uri) {
                    historyStore.delete(resource.uri.toString())
                    updateEditHistoryGroup()
                    vscode.window.showInformationMessage(
                        `Discarded history item for ${displayPath(resource.uri)}`
                    )
                }
            }
        )
    )
}

interface EditHistoryResourceState extends vscode.SourceControlResourceState {
    uri: vscode.Uri
    content: string
    timestamp: number
}

export const editTool = {
    spec: {
        name: 'text_editor',
        description:
            'An filesystem editor tool that allows access to view, create, and edit files with source control history.',
        input_schema: zodToAnthropicSchema(EditToolSchema),
    },
    invoke: async (input: EditToolInput): Promise<string> => {
        if (!editSourceControl || !editHistoryGroup) {
            throw new Error(
                'Edit Source Control not initialized. Call `initializeEditSourceControl` on extension activation.'
            )
        }

        const validInput = validateWithZod(EditToolSchema, input, 'text_editor')
        const { command, path } = validInput

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder found')
        }

        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, path)
        const displayName = displayPath(fileUri)
        // Set the diagnostics for the workspace for comparison after edits,
        const diagnosticsOnStart = vscode.languages.getDiagnostics()

        async function readFile(uri: vscode.Uri): Promise<string> {
            try {
                const fileContent = await vscode.workspace.fs.readFile(uri)
                return Buffer.from(fileContent).toString('utf8')
            } catch (error: any) {
                throw new Error(`Failed to read file ${displayName}: ${error.message}`)
            }
        }

        async function writeFile(uri: vscode.Uri, content: string): Promise<void> {
            try {
                const contentBuffer = new TextEncoder().encode(content)
                await vscode.workspace.fs.writeFile(uri, contentBuffer)
            } catch (error: any) {
                throw new Error(`Failed to write file ${displayName}: ${error.message}`)
            }
        }

        async function view(uri: vscode.Uri, viewRange?: [number, number]): Promise<string> {
            let fileContent = await readFile(uri)
            if (viewRange) {
                const [startLine, endLine] = viewRange
                const lines = fileContent.split('\n')
                if (
                    startLine < 1 ||
                    startLine > lines.length ||
                    endLine > lines.length ||
                    startLine > endLine
                ) {
                    throw new Error(`Invalid view_range: ${viewRange}.`)
                }
                fileContent = lines.slice(startLine - 1, endLine).join('\n')
            }
            return getContentTemplate(displayName, fileContent)
        }

        async function create(uri: vscode.Uri, fileText: string | undefined): Promise<string> {
            if (!fileText) {
                throw new Error('Parameter `file_text` is required for command: create')
            }
            const output = []
            try {
                const workspaceEditor = new vscode.WorkspaceEdit()
                workspaceEditor.createFile(uri, {
                    overwrite: true,
                    ignoreIfExists: true,
                })
                workspaceEditor.insert(uri, new vscode.Position(0, 0), fileText)
                await vscode.workspace.applyEdit(workspaceEditor)
                // Save the file
                const doc = await vscode.workspace.openTextDocument(uri)
                await doc.save()
                output.push(`File created successfully at: ${displayPath(uri)}`)
                await vscode.window.showTextDocument(doc)

                const problems = vscode.languages.getDiagnostics(uri)
                if (problems.length > 0) {
                    output.push(
                        `[WARNING] Error deteched, fix required: ${problems
                            .map(d => d.message)
                            .join('\n')}`
                    )
                }
                return output.join('\n')
            } catch (error: any) {
                logDebug('text_editor', `Failed to create file ${displayName}: ${error.message}`)
                return `Failed to create file ${displayName}: ${error.message}`
            }
        }

        async function replace(
            uri: vscode.Uri,
            oldStr: string | undefined,
            newStr: string | undefined
        ): Promise<string> {
            // Validate input
            if (!oldStr) {
                throw new Error('Parameter `old_str` is required for command: str_replace')
            }
            // Read file content once
            const content = await readFile(uri)
            // Check for occurrences efficiently
            const parts = content.split(oldStr)
            const occurrences = parts.length - 1
            if (occurrences === 0) {
                throw new Error(
                    `No replacement was performed, old_str \`${oldStr}\` did not appear verbatim in ${displayPath(
                        uri
                    )}.`
                )
            }
            if (occurrences > 1) {
                throw new Error(
                    `No replacement was performed. Multiple occurrences of old_str \`${oldStr}\` found. Please ensure it is unique.`
                )
            }
            const timestamp = Date.now()
            // Store history before modifying the file
            historyStore.set(uri.toString(), {
                uri,
                content,
                timestamp,
            })
            updateEditHistoryGroup()
            // Perform replacement and write file in one operation
            const newContent = parts.join(newStr || '')
            await writeFile(uri, newContent)
            // Open document
            const document = await vscode.workspace.openTextDocument(uri)
            await vscode.window.showTextDocument(document)
            // Create snippet once
            const output = []
            // Check diagnostics
            const fileProblems = vscode.languages.getDiagnostics(uri)
            if (fileProblems.length > 0) {
                output.push(`[ERROR - Action required] ${fileProblems.map(d => d.message).join('\n')}`)
            }

            const currentDiagnostics = vscode.languages.getDiagnostics()
            const diff = getDiagnosticsDiff(diagnosticsOnStart, currentDiagnostics)
            if (diff.length > 0) {
                output.push(
                    `[ERROR - Action required] ${diff
                        .map(d => d[1].map(diag => diag.message).join('\n'))
                        .join('\n')}`
                )
            }

            output.push(getContentTemplate(displayName, newContent))

            const historyUri = uri.with({ scheme: 'cody-checkpoint' })
            const title = `History: ${displayPath(uri)} (${new Date(timestamp).toLocaleString()})`
            await vscode.commands.executeCommand('vscode.diff', historyUri, uri, title)

            return output.join('\n')
        }

        async function insert(
            uri: vscode.Uri,
            insertLine: number | undefined,
            newStr: string | undefined
        ): Promise<string> {
            if (insertLine === undefined) {
                throw new Error('Parameter `insert_line` is required for command: insert')
            }
            if (!newStr) {
                throw new Error('Parameter `new_str` is required for command: insert')
            }

            const fileContent = await readFile(uri)
            const lines = fileContent.split('\n')
            if (insertLine < 0 || insertLine > lines.length) {
                throw new Error(
                    `Invalid \`insert_line\` parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${lines.length}]`
                )
            }

            // Create history item *before* modifying the file
            const timestamp = Date.now()
            historyStore.set(uri.toString(), { uri, content: fileContent, timestamp })

            updateEditHistoryGroup()

            lines.splice(insertLine, 0, ...newStr.split('\n'))
            const newFileContent = lines.join('\n')
            await writeFile(uri, newFileContent)

            // Basic snippet
            const snippet = newFileContent.substring(0, 200) + (newFileContent.length > 200 ? '...' : '')
            return `## Edited
            ${getContentTemplate(displayName, snippet)}`
        }

        // Undo edit is not directly applicable with Source Control UI, revert is handled by UI interaction
        async function undo(_uri: vscode.Uri): Promise<string> {
            return 'Undo is not supported in this context. Please use the Source Control UI to revert changes.'
        }

        switch (command) {
            case 'view':
                return view(fileUri, validInput.view_range as [number, number] | undefined)
            case 'create':
                return create(fileUri, validInput.file_text)
            case 'str_replace':
                return replace(fileUri, validInput.old_str, validInput.new_str)
            case 'insert':
                return insert(fileUri, validInput.insert_line, validInput.new_str)
            case 'undo_edit':
                return undo(fileUri)
            default:
                throw new Error(
                    `Unrecognized command ${command}. Allowed commands are: view, create, str_replace, insert, undo_edit`
                )
        }
    },
}

// Helper function to update the edit history group resource states
function updateEditHistoryGroup() {
    if (!editHistoryGroup) return
    editHistoryGroup.resourceStates = Array.from(historyStore.values()).map(item => {
        const resourceState: EditHistoryResourceState = {
            resourceUri: item.uri,
            uri: item.uri,
            content: item.content,
            timestamp: item.timestamp,
            decorations: {
                strikeThrough: false,
                tooltip: `Edited on ${new Date(item.timestamp).toLocaleString()}`,
                iconPath: new vscode.ThemeIcon('history'),
                // Add discard button that uses our custom command
                light: {
                    iconPath: new vscode.ThemeIcon('discard'),
                },
                dark: {
                    iconPath: new vscode.ThemeIcon('discard'),
                },
            },
            command: {
                command: 'cody.editHistory.showDiff',
                title: 'Compare with current version',
                arguments: [
                    {
                        resourceUri: item.uri,
                        uri: item.uri,
                        content: item.content,
                        timestamp: item.timestamp,
                        decorations: {
                            strikeThrough: false,
                            tooltip: 'Compare with current version',
                        },
                    },
                ],
            },
            // Add contextValue to enable context menu items
            contextValue: 'codyEditHistoryItem',
        }
        return resourceState
    })
}

async function deleteEditHistoryItem(
    uri: vscode.Uri,
    content: string,
    timestamp?: string
): Promise<string> {
    // Remove the history item after reverting
    historyStore.delete(uri.toString())
    // Update the source control panel display
    updateEditHistoryGroup()
    const contentBuffer = new TextEncoder().encode(content)
    await vscode.workspace.fs.writeFile(uri, contentBuffer)
    const msg = `Reverted ${displayPath(uri)} to history version from ${timestamp}`
    vscode.window.showInformationMessage(msg)
    return msg
}
