import { displayPath, logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { AgentToolResult } from '.'
import { getContextFromRelativePath } from '../../../commands/context/file-path'
import { diffWithLineNum } from '../utils/diff'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { getErrorDiagnostics } from './diagnostic'
import { EditHistoryManager } from './edit-history'
import { fileOps } from './file-operations'
import { type EditToolInput, EditToolSchema } from './schema'

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
    invoke: async (input: EditToolInput): Promise<AgentToolResult> => {
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
                return {
                    text: 'Undo is not supported directly. Use the Source Control UI to revert changes.',
                }
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
async function createFile(uri: vscode.Uri, fileText: string | undefined): Promise<AgentToolResult> {
    if (!fileText) {
        throw new Error('Parameter `file_text` is required for command: create')
    }

    try {
        // Create and populate the file
        await fileOps.createFile(uri, fileText)

        // Open the file
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc)

        // Check for problems
        const problems = vscode.languages.getDiagnostics(uri)
        const output = [`File created successfully at: ${displayPath(uri)}`]

        if (problems.length > 0) {
            output.push(`[WARNING] Issues detected: ${problems.map(d => d.message).join('\n')}`)
        }

        return { text: output.join('\n') }
    } catch (error: any) {
        logDebug('text_editor', `Failed to create file ${displayPath(uri)}: ${error.message}`)
        return { text: `Failed to create file ${displayPath(uri)}: ${error.message}` }
    }
}

/**
 * Replace text in a file
 */
async function replaceInFile(
    uri: vscode.Uri,
    oldStr: string | undefined,
    newStr: string | undefined
): Promise<AgentToolResult> {
    if (!oldStr) {
        return { text: 'Parameter `old_str` is required for command: str_replace' }
    }

    const fileName = displayPath(uri)

    try {
        // Read current content
        const content = await fileOps.read(uri)

        // Check for occurrences
        const parts = content.split(oldStr)
        const occurrences = parts.length - 1

        if (occurrences === 0) {
            return { text: `No replacement performed: text not found in ${fileName}.` }
        }

        if (occurrences > 1) {
            return {
                text: `No replacement performed: multiple occurrences of text found in ${fileName}.`,
            }
        }

        // Save history and perform replacement
        const timestamp = EditHistoryManager.saveHistory(uri, content)
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
        const title = `History: ${fileName} (${new Date(timestamp).toLocaleString()})`
        await vscode.commands.executeCommand('vscode.diff', historyUri, uri, title)

        const diagnosticsOnEnd = getErrorDiagnostics(uri)
        if (diagnosticsOnEnd.length) {
            output.push('[Error deteched - Action required]')
            for (const diagnostic of diagnosticsOnEnd) {
                output.push(diagnostic.message)
            }
        }

        // Get updated context for the file
        const updatedContext = await getContextFromRelativePath(fileName)

        return {
            text: output.join('\n'),
            contextItems: updatedContext?.content ? [updatedContext] : undefined,
        }
    } catch (error: any) {
        return { text: `Failed to replace text in ${fileName}: ${error.message}` }
    }
}

/**
 * Insert text at a specific line in a file
 */
async function insertInFile(
    uri: vscode.Uri,
    insertLine: number | undefined,
    newStr: string | undefined
): Promise<AgentToolResult> {
    if (insertLine === undefined) {
        throw new Error('Parameter `insert_line` is required for insert command.')
    }

    if (!newStr) {
        throw new Error('Parameter `new_str` is required for insert command.')
    }

    try {
        const displayName = displayPath(uri)
        const fileContent = await fileOps.read(uri)
        const lines = fileContent.split('\n')

        // Validate line number
        if (insertLine < 0 || insertLine > lines.length) {
            throw new Error(`Invalid line number: ${insertLine}. Valid range: 0-${lines.length}`)
        }

        // Save history and insert the new content
        EditHistoryManager.saveHistory(uri, fileContent)
        lines.splice(insertLine, 0, ...newStr.split('\n'))
        await fileOps.write(uri, lines.join('\n'))

        // Open document
        const document = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(document)

        return { text: `Inserted content at line ${insertLine} in ${displayName}.` }
    } catch (error: any) {
        return { text: `Failed to insert text: ${error.message}` }
    }
}
