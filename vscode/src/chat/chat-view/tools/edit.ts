import { UIToolStatus, displayPath, logDebug } from '@sourcegraph/cody-shared'
import { ContextItemSource } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import * as vscode from 'vscode'
import { diffWithLineNum } from '../utils/diff'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { getErrorDiagnostics } from './diagnostic'
import { fileOps } from './file-operations'
import { type EditToolInput, EditToolSchema } from './schema'

/**
 * Creates a ContextItemToolState for edit operations
 */
function createEditToolState(
    id: string,
    status: UIToolStatus,
    uri: vscode.Uri | undefined,
    content: string | undefined,
    outputType: 'file-view' | 'file-diff' | 'status' = 'file-view'
): ContextItemToolState {
    return {
        type: 'tool-state',
        toolId: id || `edit-${Date.now()}`,
        toolName: 'text_editor',
        status,
        outputType,
        // ContextItemCommon properties
        uri: uri || vscode.Uri.parse(`cody:/tools/edit/${id}`),
        content,
        title: 'Text Editor Operation',
        description: content?.split('\n')[0] || 'File edit operation',
        source: ContextItemSource.Agentic,
        icon: 'edit',
        metadata: [
            `Operation: ${outputType}`,
            `Status: ${status}`,
            ...(uri ? [`File: ${displayPath(uri)}`] : []),
        ],
    }
}

/**
 * The text editor tool for agents
 */
export const editTool = {
    spec: {
        name: 'text_editor',
        description:
            'An filesystem editor tool that allows access to view, create, and edit files with source control history.',
        input_schema: zodToolSchema(EditToolSchema),
    },
    invoke: async (input: EditToolInput) => {
        // Validate input
        const validInput = validateWithZod(EditToolSchema, input, 'text_editor')
        const { command, path } = validInput

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            throw new Error('No workspace folder found')
        }

        // Prepare file path and capture initial diagnostics
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, path)

        // Process commands
        switch (command) {
            case 'create':
                return createFile(fileUri, validInput.file_text)
            case 'str_replace':
                return replaceInFile(fileUri, validInput.old_str, validInput.new_str)
            case 'insert':
                return insertInFile(fileUri, validInput.insert_line, validInput.new_str)
            case 'undo_edit':
                return createEditToolState(
                    `undo-${Date.now()}`,
                    UIToolStatus.Error,
                    undefined,
                    'Undo is not supported directly. Use the Source Control UI to revert changes.',
                    'status'
                )

            default:
                throw new Error(
                    `Unrecognized command ${command}. Allowed commands are: create, str_replace, insert, undo_edit`
                )
        }
    },
}

/**
 * Create a new file
 */
async function createFile(uri: vscode.Uri, fileText: string | undefined): Promise<ContextItemToolState> {
    const toolId = `create-${Date.now()}`

    if (!fileText) {
        return createEditToolState(
            toolId,
            UIToolStatus.Error,
            uri,
            'Parameter `file_text` is required for command: create',
            'status'
        )
    }

    try {
        // Create and populate the file
        await fileOps.createFile(uri, fileText)

        // Open the file
        await vscode.workspace.openTextDocument(uri)

        // Check for problems
        const problems = vscode.languages.getDiagnostics(uri)
        const output = [`File created successfully at: ${displayPath(uri)}`]

        if (problems.length > 0) {
            output.push(`[WARNING] Issues detected: ${problems.map(d => d.message).join('\n')}`)
        }

        return createEditToolState(toolId, UIToolStatus.Done, uri, output.join('\n'), 'file-view')
    } catch (error: any) {
        logDebug('text_editor', `Failed to create file ${displayPath(uri)}: ${error.message}`)
        return createEditToolState(
            toolId,
            UIToolStatus.Error,
            uri,
            `Failed to create file ${displayPath(uri)}: ${error.message}`,
            'status'
        )
    }
}

/**
 * Replace text in a file
 */
async function replaceInFile(
    uri: vscode.Uri,
    oldStr: string | undefined,
    newStr: string | undefined
): Promise<ContextItemToolState> {
    const toolId = `replace-${Date.now()}`

    if (!oldStr) {
        return createEditToolState(
            toolId,
            UIToolStatus.Error,
            uri,
            'Parameter `old_str` is required for command: str_replace',
            'status'
        )
    }

    const fileName = displayPath(uri)

    try {
        // Read current content
        const content = await fileOps.read(uri)

        // Check for occurrences
        const parts = content.split(oldStr)
        const occurrences = parts.length - 1

        if (occurrences === 0) {
            return createEditToolState(
                toolId,
                UIToolStatus.Error,
                uri,
                `Failed: No replacement performed: text not found in ${fileName}.`,
                'status'
            )
        }

        if (occurrences > 1) {
            return createEditToolState(
                toolId,
                UIToolStatus.Error,
                uri,
                `Failed: No replacement performed: multiple occurrences of text found in ${fileName}.`,
                'status'
            )
        }

        // Save history and perform replacement
        // const timestamp = EditHistoryManager.saveHistory(uri, content)
        const newContent = parts.join(newStr || '')
        await fileOps.write(uri, newContent)

        // Open document and show diff
        const document = await vscode.workspace.openTextDocument(uri)
        await document.save()

        // Generate output
        const diffMarkdown = diffWithLineNum(content, newContent)
        const output = [`Edited ${fileName}`, diffMarkdown]

        // Show diff view
        const historyUri = uri.with({ scheme: 'cody-checkpoint' })

        logDebug('text_editor', 'New content created', { uri: historyUri })

        const diagnosticsOnEnd = getErrorDiagnostics(uri)
        if (diagnosticsOnEnd.length) {
            output.push('[Error detected - Action required]')
            for (const diagnostic of diagnosticsOnEnd) {
                output.push(diagnostic.message)
            }
        }

        const result = createEditToolState(
            toolId,
            UIToolStatus.Done,
            uri,
            output.join('\n'),
            'file-diff'
        )

        // Add file diff properties
        result.metadata = [content, newContent]

        return result
    } catch (error: any) {
        return createEditToolState(
            toolId,
            UIToolStatus.Error,
            uri,
            `Failed to replace text in ${fileName}: ${error.message}`,
            'status'
        )
    }
}

/**
 * Insert text at a specific line in a file
 */
async function insertInFile(
    uri: vscode.Uri,
    insertLine: number | undefined,
    newStr: string | undefined
): Promise<ContextItemToolState> {
    const toolId = `insert-${Date.now()}`

    if (insertLine === undefined) {
        return createEditToolState(
            toolId,
            UIToolStatus.Error,
            uri,
            'Parameter `insert_line` is required for insert command.',
            'status'
        )
    }

    if (!newStr) {
        return createEditToolState(
            toolId,
            UIToolStatus.Error,
            uri,
            'Parameter `new_str` is required for insert command.',
            'status'
        )
    }

    try {
        const displayName = displayPath(uri)
        const fileContent = await fileOps.read(uri)
        const lines = fileContent.split('\n')

        // Validate line number
        if (insertLine < 0 || insertLine > lines.length) {
            return createEditToolState(
                toolId,
                UIToolStatus.Error,
                uri,
                `Invalid line number: ${insertLine}. Valid range: 0-${lines.length}`,
                'status'
            )
        }

        // Save history and insert the new content
        // EditHistoryManager.saveHistory(uri, fileContent)

        lines.splice(insertLine, 0, ...newStr.split('\n'))
        await fileOps.write(uri, lines.join('\n'))

        // Open document
        await vscode.workspace.openTextDocument(uri)

        return createEditToolState(
            toolId,
            UIToolStatus.Done,
            uri,
            `Inserted content at line ${insertLine} in ${displayName}.`,
            'file-view'
        )
    } catch (error: any) {
        return createEditToolState(
            toolId,
            UIToolStatus.Error,
            uri,
            `Failed to insert text: ${error.message}`,
            'status'
        )
    }
}
