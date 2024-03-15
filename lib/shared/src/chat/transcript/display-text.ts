import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import type { RangeData } from '../../common/range'

/**
 * VS Code intentionally limits what `command:vscode.open?ARGS` can have for args (see
 * https://github.com/microsoft/vscode/issues/178868#issuecomment-1494826381); you can't pass a
 * selection or viewColumn. We need to proxy `vscode.open` to be able to pass these args.
 *
 * Also update `lib/shared/src/chat/markdown.ts`'s `ALLOWED_URI_REGEXP` if you change this.
 */
export const CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID = '_cody.vscode.open'

/**
 * Return a `command:` URI for use within VS Code webviews that invokes `vscode.open` (proxied via
 * {@link CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}).
 */
export function commandURIForVSCodeOpen(resource: URI, range?: RangeData): string {
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
