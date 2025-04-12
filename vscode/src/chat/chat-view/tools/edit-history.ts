import { displayPath } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

// History item interface shared between source control and edit tool
export interface HistoryItem {
    content: string
    timestamp: number
    uri: vscode.Uri
}

/**
 * Interface for edit history resource state
 */
export interface EditHistoryResourceState extends vscode.SourceControlResourceState {
    uri: vscode.Uri
    content: string
    timestamp: number
}

// Global state management for source control
let editSourceControl: vscode.SourceControl | undefined
let editHistoryGroup: vscode.SourceControlResourceGroup | undefined
const historyStore = new Map<string, HistoryItem>()

/**
 * Initialize the edit history source control UI
 * NOTE: Temporary disabled due to abort issue caused by auto edit
 */
export function initializeEditToolHistory(): vscode.Disposable[] {
    if (editSourceControl) {
        return []
    }

    // Create source control for edit history
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
    editSourceControl = vscode.scm.createSourceControl(
        'codyEditHistory',
        'Cody Edit History',
        workspaceUri
    )
    editHistoryGroup = editSourceControl.createResourceGroup('history', 'Edit History')
    editHistoryGroup.hideWhenEmpty = true
    editSourceControl.count = 0

    // Auto cleanup when file content matches original history state
    const disposables = [
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor) return

            const uri = editor.document.uri
            setTimeout(async () => {
                try {
                    const historyItem = historyStore.get(uri.toString())
                    if (historyItem && editor.document.getText() === historyItem.content) {
                        historyStore.delete(uri.toString())
                        updateEditHistoryGroup()
                    }
                } catch (error) {
                    // Ignore errors here
                }
            }, 200)
        }),

        // Register commands
        vscode.commands.registerCommand(
            'cody.discardHistoryItem',
            (resource: EditHistoryResourceState) => {
                if (resource?.uri) {
                    historyStore.delete(resource.uri.toString())
                    updateEditHistoryGroup()
                }
            }
        ),

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
                    await revertToHistoryItem(
                        resource.uri,
                        resource.content,
                        new Date(resource.timestamp).toLocaleString()
                    )
                }
            }
        ),

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
        ),

        // Register content provider for checkpoint diffs
        vscode.workspace.registerTextDocumentContentProvider('cody-checkpoint', {
            provideTextDocumentContent: (uri: vscode.Uri): string => {
                const originalFilePath = uri.path
                const historyItem = Array.from(historyStore.values()).find(
                    item => vscode.Uri.file(item.uri.path).path === originalFilePath
                )
                return historyItem?.content || ''
            },
        }),
    ]

    // Setup quick diff provider
    if (editSourceControl) {
        editSourceControl.quickDiffProvider = {
            provideOriginalResource: (uri: vscode.Uri): Thenable<vscode.Uri | null> =>
                Promise.resolve(
                    historyStore.has(uri.toString()) ? uri.with({ scheme: 'cody-checkpoint' }) : null
                ),
        }
        disposables.push(editSourceControl)
    }

    // Add all disposables to context
    return disposables
}

/**
 * Helper functions for history storage management
 */
export const EditHistoryManager = {
    saveHistory: (uri: vscode.Uri, content: string): number => {
        const timestamp = Date.now()
        historyStore.set(uri.toString(), { uri, content, timestamp })
        updateEditHistoryGroup()
        return timestamp
    },

    getHistory: (uri: vscode.Uri): HistoryItem | undefined => {
        return historyStore.get(uri.toString())
    },

    deleteHistory: (uri: vscode.Uri): boolean => {
        const result = historyStore.delete(uri.toString())
        updateEditHistoryGroup()
        return result
    },

    hasHistory: (uri: vscode.Uri): boolean => {
        return historyStore.has(uri.toString())
    },
}

/**
 * Update the edit history resources in the source control UI
 */
function updateEditHistoryGroup() {
    if (!editHistoryGroup) return

    editHistoryGroup.resourceStates = Array.from(historyStore.values()).map(item => ({
        resourceUri: item.uri,
        uri: item.uri,
        content: item.content,
        timestamp: item.timestamp,
        decorations: {
            strikeThrough: false,
            tooltip: `Edited on ${new Date(item.timestamp).toLocaleString()}`,
            iconPath: new vscode.ThemeIcon('history'),
            light: { iconPath: new vscode.ThemeIcon('discard') },
            dark: { iconPath: new vscode.ThemeIcon('discard') },
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
        contextValue: 'codyEdited',
    }))
}

/**
 * Revert to a history item
 */
async function revertToHistoryItem(
    uri: vscode.Uri,
    content: string,
    timestamp?: string
): Promise<string> {
    // Create buffer from content
    const contentBuffer = new TextEncoder().encode(content)

    // Start file write operation first to parallelize I/O
    const writePromise = vscode.workspace.fs.writeFile(uri, contentBuffer)

    // Perform synchronous operations while file write is in progress
    historyStore.delete(uri.toString())
    updateEditHistoryGroup()

    // Wait for file write to complete
    await writePromise

    // Create message only once and reuse
    const msg = `Reverted ${displayPath(uri)} to history version from ${timestamp || 'earlier'}`
    vscode.window.showInformationMessage(msg)
    return msg
}
