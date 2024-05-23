import path from 'node:path'
import * as vscode from 'vscode'
import { vscodeWorkspaceTextDocuments } from '../../../../testutils/mocks'
import { CURSOR_MARKER, documentAndPosition } from '../../../test-helpers'
import { TscRetriever, defaultTscRetrieverOptions } from './tsc-retriever'

export class TscRetrieverSuite {
    public retriever = new TscRetriever({
        ...defaultTscRetrieverOptions(),
        includeSymbolsInCurrentFile: true,
        maxNodeMatches: 1,
        maxSymbolDepth: 1,
    })

    private counter = 1

    public openFile(
        text: string,
        params?: { skipNamespace: boolean }
    ): {
        document: vscode.TextDocument
        position: vscode.Position
        moduleName: string
        namespaceName: string
    } {
        if (!text.includes(CURSOR_MARKER)) {
            text = text + CURSOR_MARKER
        }
        const counter = ++this.counter
        const moduleName = `example_${counter}`
        const namespaceName = `test_${counter}`
        const uri = vscode.Uri.file(path.join(process.cwd(), moduleName + '.ts'))
        // NOTE: wrap in namespace to avoid conflicts when reusing type names
        // between different tests. There's something buggy in how we load the
        // tsc service in this test suite so we get wrong results in we define
        // `interface A {}` in one file and `class A {}` in another.
        const wrappedText = params?.skipNamespace
            ? text
            : `export namespace ${namespaceName} {\n${text}\n}`
        const { document, position } = documentAndPosition(wrappedText, 'typescript', uri.toString())
        vscodeWorkspaceTextDocuments.push(document)
        return { document, position, moduleName, namespaceName }
    }
}
