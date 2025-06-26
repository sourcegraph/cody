import * as vscode from 'vscode'

import { type BillingCategory, CodyIDE, telemetryRecorder } from '@sourcegraph/cody-shared'
import {
    ACCOUNT_LIMITS_INFO_URL,
    ACCOUNT_USAGE_URL,
    CODY_DOC_URL,
    CODY_FEEDBACK_URL,
    CODY_SUPPORT_URL,
    DISCORD_URL,
} from '../chat/protocol'
import { getReleaseNotesURLByIDE } from '../release'
import { version } from '../version'

export function logSidebarClick(feature: string, billingCategory?: BillingCategory) {
    telemetryRecorder.recordEvent(
        `cody.sidebar.${feature}`,
        'clicked',
        billingCategory
            ? {
                  billingMetadata: {
                      category: billingCategory,
                      product: 'cody',
                  },
              }
            : {}
    )
}

export function registerSidebarCommands(): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('cody.sidebar.commands', (feature: string, command: string) => {
            // For Custom Commands
            if (command === 'cody.action.command') {
                logSidebarClick('custom', 'core')
                void vscode.commands.executeCommand(command, feature, { source: 'sidebar' })
                return
            }
            logSidebarClick(feature, 'core')
            void vscode.commands.executeCommand(command, { source: 'sidebar' })
        }),
        vscode.commands.registerCommand('cody.show-page', (page: string) => {
            logSidebarClick(page, 'billable')
            let url: URL
            switch (page) {
                case 'usage':
                    url = ACCOUNT_USAGE_URL
                    break
                case 'rate-limits':
                    url = ACCOUNT_LIMITS_INFO_URL
                    break
                default:
                    console.warn(`Unable to show unknown page: "${page}"`)
                    return
            }
            void vscode.env.openExternal(vscode.Uri.parse(url.toString()))
        }),
        vscode.commands.registerCommand('cody.sidebar.settings', () => {
            logSidebarClick('settings', 'billable')
            void vscode.commands.executeCommand('cody.status-bar.interacted')
        }),
        vscode.commands.registerCommand('cody.sidebar.keyboardShortcuts', () => {
            logSidebarClick('keyboardShortcuts', 'billable')
            void vscode.commands.executeCommand(
                'workbench.action.openGlobalKeybindings',
                '@ext:sourcegraph.cody-ai'
            )
        }),
        vscode.commands.registerCommand('cody.sidebar.releaseNotes', () => {
            logSidebarClick('releaseNotes')
            void vscode.commands.executeCommand(
                'vscode.open',
                getReleaseNotesURLByIDE(version, CodyIDE.VSCode)
            )
        }),
        vscode.commands.registerCommand('cody.sidebar.documentation', () => {
            logSidebarClick('documentation', 'billable')
            void vscode.commands.executeCommand('vscode.open', CODY_DOC_URL.href)
        }),
        vscode.commands.registerCommand('cody.sidebar.support', () => {
            logSidebarClick('support')
            void vscode.commands.executeCommand('vscode.open', CODY_SUPPORT_URL.href)
        }),
        vscode.commands.registerCommand('cody.sidebar.feedback', () => {
            logSidebarClick('feedback')
            void vscode.commands.executeCommand('vscode.open', CODY_FEEDBACK_URL.href)
        }),
        vscode.commands.registerCommand('cody.sidebar.discord', () => {
            logSidebarClick('discord')
            void vscode.commands.executeCommand('vscode.open', DISCORD_URL.href)
        }),
        vscode.commands.registerCommand('cody.sidebar.account', () => {
            logSidebarClick('account', 'billable')
            void vscode.commands.executeCommand('cody.auth.account')
        }),
        vscode.commands.registerCommand('cody.sidebar.logs', () => {
            logSidebarClick('logs')
            void vscode.commands.executeCommand('cody.debug.export.logs')
        }),
    ]
}
