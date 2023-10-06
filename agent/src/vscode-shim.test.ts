import assert from 'assert'

import { describe, it } from 'vitest'
import * as vscode from 'vscode'

describe('vscode-shim', () => {
    describe('vscode.Uri', () => {
        it('static file() is available', () => {
            assert.equal(vscode.Uri.file('a.txt').toString(), 'file:///a.txt')
        })

        it('static from() is available', () => {
            assert.equal(vscode.Uri.from({ scheme: 'file://', path: '/a.txt' }).toString(), 'file:///a.txt')
        })

        it('static joinPath() is available', () => {
            assert.equal(
                vscode.Uri.joinPath(vscode.Uri.parse('http://example.org'), 'one', 'two').toString(),
                'http://example.org/one/two'
            )
        })

        it('static parse() is available', () => {
            assert.equal(vscode.Uri.parse('http://example.org').toString(), 'http://example.org')
        })

        it('fsPath is available', () => {
            assert.equal(vscode.Uri.file('/a.txt').fsPath, 'file:///a.txt')
        })

        it('instanceof can be used', () => {
            assert.ok(vscode.Uri.parse('http://example.org/one/two') instanceof vscode.Uri)
        })
    })
})
