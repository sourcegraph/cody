import * as vscode from 'vscode'

import {
    ACCOUNT_LIMITS_INFO_URL,
    ACCOUNT_UPGRADE_URL,
    ACCOUNT_USAGE_URL,
    CODY_DOC_URL,
    CODY_FEEDBACK_URL,
    DISCORD_URL,
} from '../chat/protocol'
import { releaseNotesURL } from '../release'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { version } from '../version'

export function registerSidebarCommands(): vscode.Disposable[] {
    function logSidebarClick(feature: string) {
        telemetryService.log(`CodyVSCodeExtension:sidebar:${feature}:clicked`, undefined, {
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent(`cody.sidebar.${feature}`, 'clicked')
    }

    return [
        vscode.commands.registerCommand('cody.show-page', (page: string) => {
            logSidebarClick(page)
            let url: URL
            switch (page) {
                case 'upgrade':
                    url = ACCOUNT_UPGRADE_URL
                    break
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
            logSidebarClick('settings')
            void vscode.commands.executeCommand('cody.status-bar.interacted')
        }),
        vscode.commands.registerCommand('cody.sidebar.keyboardShortcuts', () => {
            logSidebarClick('keyboardShortcuts')
            void vscode.commands.executeCommand(
                'workbench.action.openGlobalKeybindings',
                '@ext:sourcegraph.cody-ai'
            )
        }),
        vscode.commands.registerCommand('cody.sidebar.releaseNotes', () => {
            logSidebarClick('releaseNotes')
            void vscode.commands.executeCommand('vscode.open', releaseNotesURL(version))
        }),
        vscode.commands.registerCommand('cody.sidebar.documentation', () => {
            logSidebarClick('documentation')
            void vscode.commands.executeCommand('vscode.open', CODY_DOC_URL.href)
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
            logSidebarClick('account')
            void vscode.commands.executeCommand('cody.auth.account')
        }),
        vscode.commands.registerCommand('cody.sidebar.logs', () => {
            logSidebarClick('logs')
            void vscode.commands.executeCommand('cody.debug.export.logs')
        }),
    ]
}
