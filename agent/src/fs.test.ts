import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

describe('vscode.workspace.fs', () => {
    it('stat', async () => {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.parse('file:///Users/olafurpg/'))
        expect(stat.type).toBe(vscode.FileType.Directory)
    })
    it('readDirectory', async () => {
        const readDirectory = await vscode.workspace.fs.readDirectory(vscode.Uri.parse('file:///Users/olafurpg/'))
        console.log(readDirectory)
    })
})
