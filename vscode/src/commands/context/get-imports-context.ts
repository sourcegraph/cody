import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'
import { getFoldingRanges } from '../../editor-context/helpers'

export async function getContextFileFromImports(): Promise<ContextFile | undefined> {
    try {
        const editor = getEditor()?.active
        const document = editor?.document

        if (!editor || !document) {
            return undefined
        }

        const lastImportRange = await getFoldingRanges(document.uri, 'imports', true)
        const lastImportLineRange = lastImportRange?.[0]
        if (!lastImportLineRange) {
            return
        }

        // Get the line number of the last import statement
        const lastImportLine = lastImportLineRange.end
        const range = new vscode.Range(0, 0, lastImportLine, 0)
        const importStatements = document.getText(range)
        if (!importStatements?.trim()) {
            return
        }

        const truncatedContent = truncateText(importStatements, MAX_CURRENT_FILE_TOKENS / 2)

        return {
            type: 'file',
            uri: document.uri,
            content: truncatedContent,
            range: range,
            source: 'editor',
        }
    } catch {
        return
    }
}
