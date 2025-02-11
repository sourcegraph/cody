import { currentResolvedConfig } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export interface UI3WebviewService extends vscode.Disposable {
    createWebview(location: WebviewLocation): Promise<vscode.Webview>
}

type WebviewLocation = 'editor' | 'sidebar'

interface StoredWebviewState {
    location: WebviewLocation
    // add additional fields if you need to persist more state info
}

const WEBVIEW_VIEW_TYPE = 'cody.ui3'
const DEV_SERVER_URL = 'http://localhost:5133'

export function createUI3WebviewManager(): UI3WebviewService {
    const disposables: vscode.Disposable[] = []

    const activeWebviews = new Set<vscode.WebviewPanel>()

    disposables.push(
        vscode.window.registerWebviewPanelSerializer(WEBVIEW_VIEW_TYPE, {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: any) {
                // state should include the location
                const storedState = state as StoredWebviewState
                await reviveWebviewPanel(panel, storedState || { location: 'editor' })

                // TODO!(sqs): dedupe
                panel.webview.html = await htmlForWebview(panel)
                activeWebviews.add(panel)
                panel.onDidDispose(() => activeWebviews.delete(panel))
            },
        })
    )

    /**
     * Creates and shows a new webview.
     *
     * @param location Whether the webview should open in the 'editor' or 'sidebar'
     */
    async function createWebview(location: WebviewLocation): Promise<vscode.Webview> {
        if (location !== 'editor') {
            throw new Error('only the editor WebviewLocation is supported')
        }

        const panel = vscode.window.createWebviewPanel(
            WEBVIEW_VIEW_TYPE,
            'ui3',
            vscode.ViewColumn.Active,
            {
                retainContextWhenHidden: false,
                enableScripts: true,
                enableFindWidget: false,
            }
        )

        panel.webview.html = await htmlForWebview(panel)
        activeWebviews.add(panel)
        panel.onDidDispose(() => activeWebviews.delete(panel))
        return panel.webview
    }

    /**
     * Utility that can be used to rehydrate a webview panel.
     */
    async function reviveWebviewPanel(
        panel: vscode.WebviewPanel,
        state: StoredWebviewState
    ): Promise<void> {
        panel.webview.options = { enableScripts: true }
        panel.webview.html = await htmlForWebview(panel)
        activeWebviews.add(panel)
        panel.onDidDispose(() => activeWebviews.delete(panel))
    }

    return {
        createWebview,
        dispose(): void {
            for (const d of disposables) {
                d.dispose()
            }
        },
    }
}

/**
 * Returns HTML that loads the application.
 * In dev, the app is loaded from a vite dev server.
 * In prod, it loads from built assets.
 */
async function htmlForWebview(panel: vscode.WebviewPanel): Promise<string> {
    const isDev = process.env.NODE_ENV !== 'production'
    if (!isDev) {
        throw new Error('prod not supported yet TODO!(sqS)')
    }

    // In dev, load from the Vite dev server.
    const resp = await fetch(DEV_SERVER_URL)
    if (!resp.ok) {
        throw new Error('error response TODO!(sqs)')
    }
    const html = await resp.text()
    // TODO!(sqs): use csp from panel.webview.cspSource
    const { auth } = await currentResolvedConfig()
    const accessToken = auth.credentials && 'token' in auth.credentials ? auth.credentials.token : ''
    return html
        .replace(
            '</head>',
            `<meta name="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${DEV_SERVER_URL}; worker-src 'unsafe-inline' ${DEV_SERVER_URL}; style-src 'unsafe-inline';"><script>localStorage.serverEndpoint='https://sourcegraph.test:3443';localStorage.accessToken=${JSON.stringify(accessToken)};</script> </head>`
        )
        .replaceAll('import("/@fs/', 'import("http://localhost:5133/@fs/')
}
