import assert from 'assert'

import { describe, it } from 'vitest'
import * as vscode from 'vscode'

describe('vscode-shim', () => {
    describe('vscode.Uri', () => {
        it('static joinPath() method is available', () => {
            // Ensure the static methods like joinPath are available when using the shim.
            assert.equal(
                vscode.Uri.joinPath(vscode.Uri.parse('http://example.org'), 'one', 'two').toString(),
                vscode.Uri.parse('http://example.org/one/two').toString()
            )
        })

        it('instanceof can be used', () => {
            assert.ok(vscode.Uri.parse('http://example.org/one/two') instanceof vscode.Uri)
        })
    })
})
