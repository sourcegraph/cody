import type { Decorator } from '@storybook/react'

import {
    type Model,
    getDotComDefaultModels,
    isWindows,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { type CSSProperties, useState } from 'react'
import { URI } from 'vscode-uri'
import '../../node_modules/@vscode/codicons/dist/codicon.css'
import { AppWrapperForTest } from '../AppWrapperForTest'
import { type ChatModelContext, ChatModelContextProvider } from '../chat/models/chatModelContext'
import { TelemetryRecorderContext, createWebviewTelemetryRecorder } from '../utils/telemetry'
import styles from './VSCodeStoryDecorator.module.css'

setDisplayPathEnvInfo({
    isWindows: isWindows(),
    workspaceFolders: [isWindows() ? URI.file('C:\\') : URI.file('/')],
})

export enum Theme {
    DarkPlus = 'dark-plus',
    DarkModern = 'dark-modern',
    DarkHighContrast = 'dark-high-contrast',
    LightPlus = 'light-plus',
    LightModern = 'light-modern',
    LightHighContrast = 'light-high-contrast',
    Red = 'red',
}

const themeClassnames = {
    [Theme.DarkPlus]: 'vscode-dark',
    [Theme.DarkModern]: 'vscode-dark',
    [Theme.DarkHighContrast]: 'vscode-high-contrast',
    [Theme.LightPlus]: 'vscode-light',
    [Theme.LightModern]: 'vscode-light',
    [Theme.LightHighContrast]: 'vscode-high-contrast-light',
    [Theme.Red]: 'vscode-dark',
} satisfies Record<Theme, string>

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
 * A decorator that displays a story as though it's a cell in a transcript in a VS Code webview
 * panel, with VS Code theme colors applied.
 */
export const VSCodeCell: Decorator = VSCodeDecorator(styles.containerCell)

/**
 * A decorator that displays a story with VS Code theme colors applied and maximizes the viewport.
 */
export const VSCodeViewport: (style?: CSSProperties | undefined) => Decorator = style =>
    VSCodeDecorator(styles.containerViewport, style)

/**
 * A customizable decorator for components with VS Code theme colors applied.
 */
export function VSCodeDecorator(className: string | undefined, style?: CSSProperties): Decorator {
    return (story, parameters) => {
        const { theme } = parameters.globals
        const themeClassname = themeClassnames[theme as Theme] || themeClassnames[Theme.DarkModern]

        // Set [data-vscode-theme-kind] and className for the selected theme
        document.body.dataset.vscodeThemeKind = themeClassname
        document.body.className = themeClassname

        return (
            <div className={clsx(styles.container, className)} style={style}>
                <AppWrapperForTest>
                    <ChatModelContextProvider value={useDummyChatModelContext()}>
                        <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                            {story()}
                        </TelemetryRecorderContext.Provider>
                    </ChatModelContextProvider>
                </AppWrapperForTest>
            </div>
        )
    }
}

function useDummyChatModelContext(): ChatModelContext {
    const [chatModels, setChatModels] = useState(getDotComDefaultModels())
    const onCurrentChatModelChange = (value: Model): void => {
        setChatModels(chatModels =>
            chatModels.map(model => ({ ...model, default: model.id === value.id }))
        )
    }
    return { chatModels, onCurrentChatModelChange }
}

const acquireVsCodeApi = () => ({
    postMessage: (message: any) => {
        console.debug('postMessage', message)
    },
})
if (!(window as any).acquireVsCodeApi) {
    ;(window as any).acquireVsCodeApi = acquireVsCodeApi
}

const telemetryRecorder = createWebviewTelemetryRecorder(acquireVsCodeApi())
