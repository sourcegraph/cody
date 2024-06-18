import { mkdtempSync } from 'node:fs'
import fspromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ContextItem } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

/**
 * A test workspace is a temporary directory that is created before running tests.
 * Use the `beforeAll` and `afterAll` methods to set up and tear down the workspace.
 **/
export class TestWorkspace {
    public readonly rootUri: vscode.Uri
    public readonly rootPath: string

    constructor(public readonly prototypePath: string) {
        const tmpdir = mkdtempSync(path.join(os.tmpdir(), 'cody-vscode-shim-test'))
        this.rootUri = vscode.Uri.file(tmpdir)
        this.rootPath = tmpdir
    }

    public async beforeAll(): Promise<void> {
        await fspromises.mkdir(this.rootPath, { recursive: true })
        await fspromises.cp(this.prototypePath, this.rootPath, {
            recursive: true,
        })
    }
    public file(...pathParts: string[]): vscode.Uri {
        return vscode.Uri.file(path.join(this.rootPath, ...pathParts))
    }

    public async afterAll(): Promise<void> {
        try {
            await fspromises.rm(this.rootPath, {
                recursive: true,
                force: true,
                maxRetries: 5,
            })
        } catch (error) {
            console.error(
                `Ignoring error in afterAll hook while recursively deleting the directory '${this.rootPath}'`,
                error
            )
        }
    }

    public async loadContextItem(name: string): Promise<ContextItem> {
        const uri = this.file(name)
        const buffer = await vscode.workspace.fs.readFile(uri)
        const decoder = new TextDecoder('utf-8')
        const content = decoder.decode(buffer)

        return {
            uri,
            type: 'file',
            content: content,
        }
    }
}
