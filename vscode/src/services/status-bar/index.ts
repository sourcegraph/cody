import { type AuthStatus, telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import { isCodyIgnored } from '../../cody-ignore/utils'
import type { AuthProvider } from '../AuthProvider'
import { CodyStatusError } from './CodyStatusError'
import type { CodyStatusBar, StatusBarErrorName } from './types'
import { openCodySettingsQuickPicks } from './utils'

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

const COLORS = {
    DEFAULT: new vscode.ThemeColor('statusBarItem.activeBackground'),
    WARNING: new vscode.ThemeColor('statusBarItem.warningBackground'),
    ERROR: new vscode.ThemeColor('statusBarItem.errorBackground'),
}

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)

let loadingCount = 0

export function createStatusBar(authProvider: AuthProvider): CodyStatusBar {
    statusBarItem.command = 'cody.status-bar.interacted'
    statusBarItem.text = ICONS.DEFAULT

    const command = vscode.commands.registerCommand('cody.status-bar.interacted', async () => {
        const authStatus = authProvider.getAuthStatus()
        telemetryRecorder.recordEvent('cody.statusbarIcon', 'clicked', {
            privateMetadata: { loggedIn: Boolean(authStatus?.isLoggedIn) },
        })
        return authStatus?.isLoggedIn
            ? openCodySettingsQuickPicks()
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

    const authStatus = () => authProvider.getAuthStatus()

    return {
        startLoading(label: string, { timeoutMs }: { timeoutMs?: number } = {}) {
            loadingCount++
            statusBarItem.tooltip = label
            updateStatusBar(authStatus())

            const stopLoading = () => {
                loadingCount--
                updateIgnoreStatus(vscode.window.activeTextEditor?.document?.uri)
                updateStatusBar(authStatus())
            }

            if (timeoutMs) {
                setTimeout(stopLoading, timeoutMs)
            }

            return stopLoading
        },
        addError: CodyStatusError.add,
        hasError: (errorName: StatusBarErrorName) =>
            CodyStatusError.errors.some(e => e.errorType === errorName),
        setAuthStatus: (newStatus: AuthStatus) => updateStatusBar(newStatus),
        dispose: () => {
            statusBarItem.dispose()
            command.dispose()
            onDocumentChange.dispose()
        },
    }
}

const updateStatusBar = (authStatus: AuthStatus) => {
    if (loadingCount > 0) {
        statusBarItem.text = ICONS.LOADING
    }

    if (authStatus) {
        handleAuthStatusChange(authStatus)
    }

    if (CodyStatusError.errors.length) {
        statusBarItem.tooltip = CodyStatusError.errors[0].title
        statusBarItem.backgroundColor = COLORS.WARNING
    } else {
        statusBarItem.text = ICONS.DEFAULT
        statusBarItem.backgroundColor = COLORS.DEFAULT
    }

    statusBarItem.show()
}

function handleAuthStatusChange(authStatus: AuthStatus) {
    // Only show this if authStatus is present, otherwise you get a flash of
    // yellow status bar icon when extension first loads but login hasn't
    // initialized yet
    if (authStatus.isOfflineMode) {
        statusBarItem.text = `${ICONS.DEFAULT} Offline`
        statusBarItem.tooltip = 'Cody is in offline mode'
        statusBarItem.backgroundColor = COLORS.WARNING
        CodyStatusError.add(
            new CodyStatusError('Offline Mode', 'Cody is in offline mode', 'auth', false)
        )
    } else if (authStatus.showNetworkError) {
        statusBarItem.text = `${ICONS.DEFAULT} Connection Issues`
        statusBarItem.tooltip = TOOLTIPS.NETWORK_ERROR
        statusBarItem.backgroundColor = COLORS.ERROR
    } else if (!authStatus.isLoggedIn) {
        statusBarItem.text = `${ICONS.DEFAULT} Sign In`
        statusBarItem.tooltip = TOOLTIPS.SIGN_IN
        statusBarItem.backgroundColor = COLORS.WARNING
    }
}
