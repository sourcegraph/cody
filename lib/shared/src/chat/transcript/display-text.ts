import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import type { ContextItem } from '../../codebase-context/messages'
import type { RangeData } from '../../common/range'

/**
 * VS Code intentionally limits what `command:vscode.open?ARGS` can have for args (see
 * https://github.com/microsoft/vscode/issues/178868#issuecomment-1494826381); you can't pass a
 * selection or viewColumn. We need to proxy `vscode.open` to be able to pass these args.
 *
 * Also update MarkdownFromCody's `ALLOWED_URI_REGEXP` if you change this.
 */
export const CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID = '_cody.vscode.open'

/**
 * Return a `command:` URI for use within VS Code webviews that invokes `vscode.open` (proxied via
 * {@link CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}).
 */
function commandURIForVSCodeOpen(resource: URI, range?: RangeData): string {
    return `command:${CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}?${encodeURIComponent(
        JSON.stringify([
            resource,
            {
                selection: range,
                preserveFocus: true,
                background: false,
                preview: true,
                viewColumn: -2 satisfies vscode.ViewColumn.Beside,
            },
        ])
    )}`
}

/**
 * Return the URI that opens the given context item in the webview. For most context items, this
 * just calls {@link commandURIForVSCodeOpen}. However, if {@link resource} is a web page (`http` or
 * `https` protocol), then the URL itself is used with `target="_blank"`.
 */
export function webviewOpenURIForContextItem(item: Pick<ContextItem, 'uri' | 'range'>): {
    href: string
    target: '_blank' | undefined
} {
    if (item.uri.scheme === 'http' || item.uri.scheme === 'https') {
        return {
            href: item.uri.toString(),
            target: '_blank',
        }
    }
    return { href: commandURIForVSCodeOpen(item.uri, item.range), target: undefined }
}
