import { type ContextItem, isWindows } from '@sourcegraph/cody-shared'
import { describe, expect, test, vi } from 'vitest'
import * as vscode from 'vscode'
import { explainCommand } from './explain'

vi.mock('../context/selection', () => ({
    getContextFileFromCursor: () =>
        Promise.resolve<ContextItem>({ type: 'file', uri: vscode.Uri.file('foo.go') }),
}))

vi.mock('../context/current-file', () => ({
    getContextFileFromCurrentFile: () =>
        Promise.resolve<ContextItem>({ type: 'file', uri: vscode.Uri.file('bar.go') }),
}))

describe('explainCommand', () => {
    test('text', async () => {
        const result = await explainCommand(null as any, {
            range: new vscode.Range(1, 2, 3, 4),
        })
        const prefix = isWindows() ? '\\' : ''
        expect(result?.text?.toString()).toMatch(`Explain what @${prefix}foo.go ( @${prefix}bar.go )`)
    })
})
