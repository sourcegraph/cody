import type { TextDocument } from 'vscode'
import type { Edit } from '../non-stop/line-diff'

export interface ChatDiffDisplayOptions {
    showFullFile: boolean
}

export function diffInChat(
    diffs: Edit[],
    document: TextDocument,
    options: ChatDiffDisplayOptions = { showFullFile: true }
): string {
    const message = ['Here is the proposed change:\n\n```diff']
    const documentLines = document.getText().split('\n')
    const modifiedLines = new Map<number, Edit>()

    // Find first and last modified lines for compact diff
    let firstModifiedLine = documentLines.length
    let lastModifiedLine = 0

    // Build modified lines map and find boundaries
    for (const diff of diffs) {
        for (let line = diff.range.start.line; line <= diff.range.end.line; line++) {
            modifiedLines.set(line, diff)
            firstModifiedLine = Math.min(firstModifiedLine, line)
            lastModifiedLine = Math.max(lastModifiedLine, line)
        }
    }

    // Determine the range of lines to process
    const startLine = options.showFullFile ? 0 : Math.max(0, firstModifiedLine - 3) // Show 3 lines of context
    const endLine = options.showFullFile
        ? documentLines.length
        : Math.min(documentLines.length, lastModifiedLine + 3)

    for (let lineNumber = startLine; lineNumber < endLine; lineNumber++) {
        const diff = modifiedLines.get(lineNumber)
        if (!diff) {
            message.push(` ${documentLines[lineNumber]}`)
            continue
        }

        switch (diff.type) {
            case 'deletion':
                if (lineNumber === diff.range.start.line) {
                    message.push(`- ${diff.oldText}`)
                }
                break
            case 'decoratedReplacement':
                if (lineNumber === diff.range.start.line) {
                    message.push(
                        diff.oldText
                            .trimEnd()
                            .split('\n')
                            .map(line => `- ${line}`)
                            .join('\n'),
                        diff.text
                            .trimEnd()
                            .split('\n')
                            .map(line => `+ ${line}`)
                            .join('\n')
                    )
                }
                break
            case 'insertion':
                if (lineNumber === diff.range.start.line) {
                    message.push(
                        diff.text
                            .trimEnd()
                            .split('\n')
                            .map(line => `+ ${line}`)
                            .join('\n')
                    )
                }
                break
        }
    }

    message.push('```')
    return message.join('\n')
}
