import type { Reroute } from '@sveltejs/kit'

export const reroute: Reroute = ({ url }) => {
    if (url.protocol === 'vscode-webview:' && url.pathname === '/index.html') {
        // When running inside VS Code webviews, we want to map vscode-webview://index.html to the
        // root.
        return '/'
    }
}
