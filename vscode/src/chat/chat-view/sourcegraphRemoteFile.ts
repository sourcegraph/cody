import { graphqlClient, isError } from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

export class SourcegraphRemoteFileProvider
    implements vscode.TextDocumentContentProvider, vscode.Disposable
{
    private cache = new LRUCache<string, string>({ max: 128 })
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(
            vscode.workspace.registerTextDocumentContentProvider('codysourcegraph', this)
        )
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const content =
            this.cache.get(uri.toString()) ||
            (await SourcegraphRemoteFileProvider.getFileContentsFromURL(uri))

        this.cache.set(uri.toString(), content)

        return content
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
}
