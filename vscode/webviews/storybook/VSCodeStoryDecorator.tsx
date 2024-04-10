import type { Decorator } from '@storybook/react'

import {
    DEFAULT_DOT_COM_MODELS,
    type ModelProvider,
    isWindows,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import { type CSSProperties, useState } from 'react'
import { URI } from 'vscode-uri'
import '../../node_modules/@vscode/codicons/dist/codicon.css'
import { type ChatModelContext, ChatModelContextProvider } from '../chat/models/chatModelContext'
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
 * A customizable decorator for components with VS Code theme colors applied.
 */
export function VSCodeDecorator(className: string | undefined, style?: CSSProperties): Decorator {
    document.body.dataset.vscodeThemeKind = 'vscode-dark'
    return story => (
        <div className={classNames(styles.container, className)} style={style}>
            <WithChatContextClient value={dummyChatContextClient}>
                <ChatModelContextProvider value={useDummyChatModelContext()}>
                    {story()}
                </ChatModelContextProvider>
            </WithChatContextClient>
        </div>
    )
}

function useDummyChatModelContext(): ChatModelContext {
    const [chatModels, setChatModels] = useState(DEFAULT_DOT_COM_MODELS)
    const onCurrentChatModelChange = (value: ModelProvider): void => {
        setChatModels(chatModels =>
            chatModels.map(model => ({ ...model, default: model.model === value.model }))
        )
    }
    return { chatModels, onCurrentChatModelChange }
}

if (!(window as any).acquireVsCodeApi) {
    ;(window as any).acquireVsCodeApi = () => ({
        postMessage: () => {},
    })
}
