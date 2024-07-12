import { type AuthStatus, telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import { isCodyIgnored } from '../../cody-ignore/utils'
import type { AuthProvider } from '../AuthProvider'
import { CodyStatusError } from './CodyStatusError'
import type { CodyStatusBar, StatusBarErrorName } from './types'
import { openStatusBarQuickPicks } from './utils'

const ICONS = {
    DEFAULT: '$(cody-logo-heavy)',
    DISABLED: '$(cody-logo-heavy-slash)',
    LOADING: '$(loading~spin)',
}

const TOOLTIPS = {
    DEFAULT: 'Cody Settings',
    DISABLED: 'The current file is ignored by Cody',
    SIGN_IN: 'Sign in to get started with Cody',
    NETWORK_ERROR: 'Resolve network issues for Cody to work again',
}

export function createStatusBar(authProvider: AuthProvider): CodyStatusBar {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
    statusBarItem.command = 'cody.status-bar.interacted'
    statusBarItem.show()

    let loadingCount = 0

    const updateStatusBar = (newStatus?: AuthStatus) => {
        if (loadingCount > 0) {
            statusBarItem.text = ICONS.LOADING
        }

        const authStatus = newStatus ?? authProvider.getAuthStatus()
        if (authStatus) {
            if (authStatus.showNetworkError) {
                statusBarItem.text = `${ICONS.DEFAULT} Connection Issues`
                statusBarItem.tooltip = TOOLTIPS.NETWORK_ERROR
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
                return
            }
            if (!authStatus.isLoggedIn) {
                statusBarItem.text = `${ICONS.DEFAULT} Sign In`
                statusBarItem.tooltip = TOOLTIPS.SIGN_IN
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
                return
            }
        }

        statusBarItem.backgroundColor = CodyStatusError.errors.length
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : new vscode.ThemeColor('statusBarItem.activeBackground')

        if (CodyStatusError.errors.length) {
            statusBarItem.tooltip = CodyStatusError.errors[0].title
        }
    }

    const command = vscode.commands.registerCommand('cody.status-bar.interacted', async () => {
        const authStatus = authProvider.getAuthStatus()
        telemetryRecorder.recordEvent('cody.statusbarIcon', 'clicked', {
            privateMetadata: { loggedIn: Boolean(authStatus?.isLoggedIn) },
        })
        return authStatus?.isLoggedIn
            ? openStatusBarQuickPicks()
            : vscode.commands.executeCommand('cody.chat.focus')
    })

    const updateIgnoreStatus = async (uri?: URI) => {
        const isUriIgnored = uri ? await isCodyIgnored(uri) : false
        statusBarItem.text = isUriIgnored ? ICONS.DISABLED : ICONS.DEFAULT
        statusBarItem.tooltip = isUriIgnored ? TOOLTIPS.DISABLED : TOOLTIPS.DEFAULT
    }

    const onDocumentChange = vscode.window.onDidChangeActiveTextEditor(async editor => {
        await updateIgnoreStatus(editor?.document.uri)
    })

    return {
        startLoading(label: string, { timeoutMs }: { timeoutMs?: number } = {}) {
            loadingCount++
            statusBarItem.tooltip = label
            updateStatusBar()

            const stopLoading = () => {
                loadingCount--
                updateIgnoreStatus(vscode.window.activeTextEditor?.document?.uri)
                updateStatusBar()
            }

            if (timeoutMs) {
                setTimeout(stopLoading, timeoutMs)
            }

            return stopLoading
        },
        addError: CodyStatusError.add,
        hasError: (errorName: StatusBarErrorName) =>
            CodyStatusError.errors.some(e => e.errorType === errorName),
        syncAuthStatus: (newStatus: AuthStatus) => updateStatusBar(newStatus),
        dispose: () => {
            statusBarItem.dispose()
            command.dispose()
            onDocumentChange.dispose()
        },
    }
}
