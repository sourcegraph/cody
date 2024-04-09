import type { Decorator } from '@storybook/react'

import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import type { CSSProperties } from 'react'
import { URI } from 'vscode-uri'
import '../../node_modules/@vscode/codicons/dist/codicon.css'
import { WithChatContextClient } from '../promptEditor/plugins/atMentions/chatContextClient'
import { dummyChatContextClient } from '../promptEditor/plugins/atMentions/fixtures'
import styles from './VSCodeStoryDecorator.module.css'

setDisplayPathEnvInfo({
    isWindows: isWindows(),
    workspaceFolders: [isWindows() ? URI.file('C:\\') : URI.file('/')],
})

/**
 * A decorator that displays a story as though it's in a VS Code webview panel, with VS Code theme
 * colors applied.
 */
export const VSCodeWebview: Decorator = VSCodeDecorator(styles.containerWebview)

/**
 * A decorator that displays a story as though it's in the VS Code sidebar, with VS Code theme
 * colors applied.
 */
export const VSCodeSidebar: Decorator = VSCodeDecorator(styles.containerSidebar)

/**
 * A decorator that displays a story with VS Code theme colors applied.
 */
export const VSCodeStandaloneComponent: Decorator = VSCodeDecorator(undefined)

/**
 * A decorator that displays a story with VS Code theme colors applied and maximizes the viewport.
 */
export const VSCodeViewport: (style?: CSSProperties | undefined) => Decorator = style =>
    VSCodeDecorator(styles.containerViewport, style)

/**
 * A customizable decorator for components with VS Code theme colors applied.
 */
export function VSCodeDecorator(className: string | undefined, style?: CSSProperties): Decorator {
    document.body.dataset.vscodeThemeKind = 'vscode-dark'
    return story => (
        <div className={classNames(styles.container, className)} style={style}>
            <WithChatContextClient value={dummyChatContextClient}>{story()}</WithChatContextClient>
        </div>
    )
}

if (!(window as any).acquireVsCodeApi) {
    ;(window as any).acquireVsCodeApi = () => ({
        postMessage: () => {},
    })
}
