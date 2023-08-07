import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

describe('vscode-shim', () => {
    describe('workspace', () => {
        it('asRelativePath', () => {
            expect(vscode.workspace.asRelativePath('/foo/bar.js', true)).toBe('boom')
        })
    })
})
