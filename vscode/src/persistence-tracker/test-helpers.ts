import type { TextDocument as VSCodeTextDocument } from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { wrapVSCodeTextDocument } from '../testutils/textDocument'

export function document(
    text: string,
    languageId: string = 'typescript',
    uriString = 'file:///test.ts'
): VSCodeTextDocument {
    return wrapVSCodeTextDocument(TextDocument.create(uriString, languageId, 0, text))
}
