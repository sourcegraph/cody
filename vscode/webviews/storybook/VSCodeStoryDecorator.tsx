import type { Decorator } from '@storybook/react'

import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type { CSSProperties } from 'react'
import { URI } from 'vscode-uri'
import '../../node_modules/@vscode/codicons/dist/codicon.css'
import { AppWrapperForTest } from '../AppWrapperForTest'
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
    DarkAyuMirage = 'dark-ayu-mirage',
    DarkGithubDimmed = 'dark-github-dimmed',
    DarkShadesOfPurple = 'dark-shades-of-purple',
    LightPlus = 'light-plus',
    LightModern = 'light-modern',
    LightHighContrast = 'light-high-contrast',
    LightMonokaiProLight = 'light-monokai-pro-light',
    LightSolarized = 'light-solarized',
    Red = 'red',
    JetBrainsDark = 'jetbrains-dark',
    JetBrainsLight = 'jetbrains-light',
}

const themeClassnames = {
    [Theme.DarkPlus]: 'vscode-dark',
    [Theme.DarkModern]: 'vscode-dark',
    [Theme.DarkHighContrast]: 'vscode-high-contrast',
    [Theme.DarkAyuMirage]: 'vscode-dark',
    [Theme.DarkGithubDimmed]: 'vscode-dark',
    [Theme.DarkShadesOfPurple]: 'vscode-dark',
    [Theme.LightPlus]: 'vscode-light',
    [Theme.LightModern]: 'vscode-light',
    [Theme.LightHighContrast]: 'vscode-high-contrast-light',
    [Theme.LightMonokaiProLight]: 'vscode-light',
    [Theme.LightSolarized]: 'vscode-light',
    [Theme.Red]: 'vscode-dark',
    [Theme.JetBrainsDark]: 'vscode-dark',
    [Theme.JetBrainsLight]: 'vscode-light',
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
                    <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                        {story()}
                    </TelemetryRecorderContext.Provider>
                </AppWrapperForTest>
            </div>
        )
    }
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
