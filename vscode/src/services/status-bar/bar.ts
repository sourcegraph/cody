import * as vscode from 'vscode'

import {
    type AuthStatus,
    type Configuration,
    contextFiltersProvider,
    isCodyIgnoredFile,
} from '@sourcegraph/cody-shared'

import { getConfiguration } from '../../configuration'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import type { CodyIgnoreType } from '../../cody-ignore/notification'
// biome-ignore lint/nursery/noRestrictedImports: Deprecated v1 telemetry used temporarily to support existing analytics.
import { telemetryService } from '../telemetry'
import { CodyStatusError } from './errors-manager'

interface StatusBarError {
    title: string
    description: string
    errorType: StatusBarErrorName
    removeAfterSelected: boolean
    removeAfterEpoch?: number
    onShow?: () => void
    onSelect?: () => void
}

export interface CodyStatusBar {
    dispose(): void
    startLoading(
        label: string,
        params?: {
            // When set, the loading lease will expire after the timeout to avoid getting stuck
            timeoutMs: number
        }
    ): () => void
    addError(error: StatusBarError): () => void
    hasError(error: StatusBarErrorName): boolean
    syncAuthStatus(newStatus: AuthStatus): void
}

const DEFAULT_TEXT = '$(cody-logo-heavy)'
const DEFAULT_TEXT_DISABLED = '$(cody-logo-heavy-slash) File Ignored'
const DEFAULT_TOOLTIP = 'Cody Settings'
const DEFAULT_TOOLTIP_DISABLED = 'The current file is ignored by Cody'

const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check) '
const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0 '

export type StatusBarErrorName = 'auth' | 'RateLimitError' | 'AutoCompleteDisabledByAdmin'

interface StatusBarItem extends vscode.QuickPickItem {
    onSelect: () => Promise<void>
}

export function createStatusBar(): CodyStatusBar {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
    statusBarItem.text = DEFAULT_TEXT
    statusBarItem.tooltip = DEFAULT_TOOLTIP
    statusBarItem.command = 'cody.status-bar.interacted'
    statusBarItem.show()

    let isCodyIgnoredType: null | CodyIgnoreType = null
    async function isCodyIgnored(uri: vscode.Uri): Promise<null | CodyIgnoreType> {
        if (uri.scheme === 'file' && isCodyIgnoredFile(uri)) {
            return 'cody-ignore'
        }
        if (await contextFiltersProvider.isUriIgnored(uri)) {
            return 'context-filter'
        }
        return null
    }
    const onDocumentChange = vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (!editor) {
            return
        }
        isCodyIgnoredType = await isCodyIgnored(editor.document.uri)
        if (isCodyIgnoredType !== 'cody-ignore') {
            vscode.commands.executeCommand('setContext', 'cody.currentFileIgnored', !!isCodyIgnoredType)
        }
        rerender()
    })
    const currentUri = vscode.window.activeTextEditor?.document?.uri
    if (currentUri) {
        isCodyIgnored(currentUri).then(isIgnored => {
            if (isCodyIgnoredType !== 'cody-ignore') {
                vscode.commands.executeCommand('setContext', 'cody.currentFileIgnored', !!isIgnored)
            }
            isCodyIgnoredType = isIgnored
        })
    }

    let authStatus: AuthStatus | undefined
    const command = vscode.commands.registerCommand(statusBarItem.command, async () => {
        telemetryService.log(
            'CodyVSCodeExtension:statusBarIcon:clicked',
            { loggedIn: Boolean(authStatus?.isLoggedIn) },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent('cody.statusbarIcon', 'clicked', {
            privateMetadata: { loggedIn: Boolean(authStatus?.isLoggedIn) },
        })

        if (!authStatus?.isLoggedIn) {
            // Bring up the sidebar view
            void vscode.commands.executeCommand('cody.focus')
            return
        }

        const workspaceConfig = vscode.workspace.getConfiguration()
        const config = getConfiguration(workspaceConfig)

        async function createFeatureToggle(
            name: string,
            description: string | undefined,
            detail: string,
            setting: string,
            getValue: (config: Configuration) => boolean | Promise<boolean>,
            requiresReload = false,
            buttons: readonly vscode.QuickInputButton[] | undefined = undefined
        ): Promise<StatusBarItem> {
            const isEnabled = await getValue(config)
            return {
                label:
                    (isEnabled ? QUICK_PICK_ITEM_CHECKED_PREFIX : QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX) +
                    name,
                description,
                detail: QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX + detail,
                onSelect: async () => {
                    await workspaceConfig.update(setting, !isEnabled, vscode.ConfigurationTarget.Global)

                    const info = `${name} ${isEnabled ? 'disabled' : 'enabled'}.`
                    const response = await (requiresReload
                        ? vscode.window.showInformationMessage(info, 'Reload Window')
                        : vscode.window.showInformationMessage(info))

                    if (response === 'Reload Window') {
                        await vscode.commands.executeCommand('workbench.action.reloadWindow')
                    }
                },
                buttons,
            }
        }

        const errors = CodyStatusError.errors
        if (errors.length > 0) {
            errors.map(error => error.onShow?.())
        }
    })

    // Reference counting to ensure loading states are handled consistently across different
    // features
    // TODO: Ensure the label is always set to the right value too.
    let openLoadingLeases = 0

    function rerender(): void {
        if (openLoadingLeases > 0) {
            statusBarItem.text = '$(loading~spin)'
        } else {
            statusBarItem.text = isCodyIgnoredType ? DEFAULT_TEXT_DISABLED : DEFAULT_TEXT
            statusBarItem.tooltip = isCodyIgnoredType ? DEFAULT_TOOLTIP_DISABLED : DEFAULT_TOOLTIP
        }

        // Only show this if authStatus is present, otherwise you get a flash of
        // yellow status bar icon when extension first loads but login hasn't
        // initialized yet
        if (authStatus) {
            if (authStatus.showNetworkError) {
                statusBarItem.text = '$(cody-logo-heavy) Connection Issues'
                statusBarItem.tooltip = 'Resolve network issues for Cody to work again'
                // statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground')
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
                return
            }
            if (!authStatus.isLoggedIn) {
                statusBarItem.text = '$(cody-logo-heavy) Sign In'
                statusBarItem.tooltip = 'Sign in to get started with Cody'
                // statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground')
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
                return
            }
        }

        if (CodyStatusError.errors.length > 0) {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
            statusBarItem.tooltip = CodyStatusError.errors[0].title
        } else {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.activeBackground')
        }
    }

    return {
        startLoading(label: string, params: { timeoutMs?: number } = {}) {
            openLoadingLeases++
            statusBarItem.tooltip = label
            rerender()

            let didClose = false
            const timeoutId = params.timeoutMs ? setTimeout(stopLoading, params.timeoutMs) : null
            function stopLoading() {
                if (didClose) {
                    return
                }
                didClose = true

                openLoadingLeases--
                rerender()
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
            }

            return stopLoading
        },
        addError(error: CodyStatusError) {
            return CodyStatusError.add(error)
        },
        hasError(errorName: StatusBarErrorName): boolean {
            return CodyStatusError.errors.some(e => e.errorType === errorName)
        },
        syncAuthStatus(newStatus: AuthStatus) {
            authStatus = newStatus
            rerender()
        },
        dispose() {
            statusBarItem.dispose()
            command.dispose()
            onDocumentChange.dispose()
        },
    }
}
