import { hydrateAfterPostMessage } from '@sourcegraph/cody-shared'
import type { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared'
import { XMLParser } from 'fast-xml-parser'
import * as vscode from 'vscode'
import type { Action, WebviewMessage } from '../chat/protocol'
import type { SymfRunner } from '../local-context/symf'

export class GuideProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private webview?: vscode.Webview
    private issueDescription = ''
    private actions: Action[] = []

    constructor(
        private extensionUri: vscode.Uri,
        private symfRunner: SymfRunner,
        private completionsClient: SourcegraphCompletionsClient
    ) {}

    dispose() {
        throw new Error('Method not implemented.')
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): Promise<void> {
        this.webview = webviewView.webview
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')

        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [webviewPath],
        }

        // Create Webview using vscode/index.html
        const root = vscode.Uri.joinPath(webviewPath, 'guide.html')
        const bytes = await vscode.workspace.fs.readFile(root)
        const decoded = new TextDecoder('utf-8').decode(bytes)
        const resources = webviewView.webview.asWebviewUri(webviewPath)

        // Set HTML for webview
        // This replace variables from the vscode/dist/index.html with webview info
        // 1. Update URIs to load styles and scripts into webview (eg. path that starts with ./)
        // 2. Update URIs for content security policy to only allow specific scripts to be run
        webviewView.webview.html = decoded
            .replaceAll('./', `${resources.toString()}/`)
            .replaceAll('{cspSource}', webviewView.webview.cspSource)

        // Register to receive messages from webview
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(message =>
                this.onDidReceiveMessage(
                    hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                )
            )
        )
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'agi/submitIssueDescription':
                this.issueDescription = message.description
                this.actions = []
                this.actions.push({
                    type: 'writeSearchQuery',
                    result: undefined,
                })
                await this.postActions()
                void this.doLastAction()
                break
        }
    }

    private async doLastAction(): Promise<void> {
        const lastAction = this.actions.at(-1)
        if (!lastAction) {
            return
        }
        switch (lastAction.type) {
            case 'writeSearchQuery': {
                const queries = await writeQueries(this.completionsClient, this.issueDescription)
                lastAction.result = queries
                await this.postActions()
                break
            }
        }
    }

    private async postActions() {
        this.webview?.postMessage({
            type: 'agi/actions',
            actions: this.actions,
        })
    }
}

/*
Create a new sidebar panel that's similar to the search panel but executes multiple queries under the hood, with various rewriting strategies.
*/

async function writeQueries(
    completionsClient: SourcegraphCompletionsClient,
    issueDescription: string
): Promise<string[]> {
    const stream = completionsClient.stream({
        messages: [
            {
                speaker: 'human',
                // text: `From this issue description, write a series of keyword searches to find related issues and documentation on Sourcegraph. Place each search query between <searchQuery>query here</searchQuery>. Here is the issue description: <issueDescription>${issueDescription}<issueDescription>`,
                text: `Using an issue description, imagine a list of existing classes, functions, and modules in code that may be relevant to resolving the issue. For each, list a few keywords that could be used to search for it in a codebase. Use the following format for the response list: <symbol><name>nameOfClassFunctionOrModule</name><keywords>a few keywords that could be used to search for this</keywords></symbol>. Here is the issue description: <issueDescription>${issueDescription}<issueDescription>`,
            },
            { speaker: 'assistant' },
        ],
        maxTokensToSample: 400,
        temperature: 0,
        topK: 2,
        fast: true,
    })

    let rawResponse = null
    for await (const message of stream) {
        switch (message.type) {
            case 'change': {
                rawResponse = message.text
                break
            }
            case 'error': {
                throw message.error
            }
        }
    }
    if (rawResponse === null) {
        throw new Error('No queries were generated')
    }
    console.log('# got rawResponse', rawResponse)

    const parser = new XMLParser()
    const document = parser.parse(rawResponse)
    console.log('# document', document)
    const queries: string[] = ['symbol', 'function', 'class', 'module']
        .flatMap((t: string) => document[t] ?? [])
        .map(s => s.keywords ?? '')
    return queries
}
