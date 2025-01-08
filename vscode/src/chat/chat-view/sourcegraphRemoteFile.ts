import { graphqlClient, isError } from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

export class SourcegraphRemoteFileProvider implements vscode.FileSystemProvider, vscode.Disposable {
    private cache = new LRUCache<string, string>({ max: 128 })
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(
            vscode.workspace.registerFileSystemProvider('codysourcegraph', this, { isReadonly: true })
        )
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array<ArrayBufferLike>> {
        const content =
            this.cache.get(uri.toString()) ||
            (await SourcegraphRemoteFileProvider.getFileContentsFromURL(uri))

        this.cache.set(uri.toString(), content)

        return new TextEncoder().encode(content)
    }

    public dispose(): void {
        this.cache.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }

    private static async getFileContentsFromURL(URL: vscode.Uri): Promise<string> {
        const path = URL.path
        const [repoRev = '', filePath] = path.split('/-/blob/')
        let [repoName, rev = 'HEAD'] = repoRev.split('@')
        repoName = repoName.replace(/^\/+/, '')

        if (!repoName || !filePath) {
            throw new Error('Invalid URI')
        }

        const dataOrError = await graphqlClient.getFileContents(repoName, filePath, rev)

        if (isError(dataOrError)) {
            throw new Error(dataOrError.message)
        }

        const content = dataOrError.repository?.commit?.file?.content

        if (!content) {
            throw new Error('File not found')
        }

        return content
    }

    // Below methods are unused

    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = new vscode.EventEmitter<
        vscode.FileChangeEvent[]
    >().event

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => {})
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        return {
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0,
        }
    }

    readDirectory() {
        return []
    }

    createDirectory() {
        throw new Error('Method not implemented.')
    }

    writeFile() {
        throw new Error('Method not implemented.')
    }

    rename() {
        throw new Error('Method not implemented.')
    }

    delete() {
        throw new Error('Method not implemented.')
    }
}
