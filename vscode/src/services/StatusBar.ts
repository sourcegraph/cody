import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ClientConfiguration,
    CodyIDE,
    contextFiltersProvider,
} from '@sourcegraph/cody-shared'

import { getConfiguration } from '../configuration'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import type { CodyIgnoreType } from '../cody-ignore/notification'
import { getGhostHintEnablement } from '../commands/GhostHintDecorator'
import { getReleaseNotesURLByIDE } from '../release'
import { version } from '../version'
import { FeedbackOptionItems, SupportOptionItems } from './FeedbackOptions'
import { enableVerboseDebugMode } from './utils/export-logs'

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
    setAuthStatus(newStatus: AuthStatus): void
}

const DEFAULT_TEXT = '$(cody-logo-heavy)'
const DEFAULT_TEXT_DISABLED = '$(cody-logo-heavy-slash) File Ignored'
const DEFAULT_TOOLTIP = 'Cody Settings'
const DEFAULT_TOOLTIP_DISABLED = 'The current file is ignored by Cody'

const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check) '
const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0 '

const ONE_HOUR = 60 * 60 * 1000

type StatusBarErrorName = 'auth' | 'RateLimitError' | 'AutoCompleteDisabledByAdmin'

interface StatusBarItem extends vscode.QuickPickItem {
    onSelect: () => Promise<void>
}

const STATUS_BAR_INTERACTION_COMMAND = 'cody.status-bar.interacted'

export function createStatusBar(): CodyStatusBar {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
    statusBarItem.text = DEFAULT_TEXT
    statusBarItem.tooltip = DEFAULT_TOOLTIP
    statusBarItem.command = STATUS_BAR_INTERACTION_COMMAND
    statusBarItem.show()

    let isCodyIgnoredType: null | CodyIgnoreType = null
    async function updateIgnoreStatus(uri: vscode.Uri | undefined): Promise<void> {
        if (!uri) {
            isCodyIgnoredType = null
            return
        }
        isCodyIgnoredType = (await contextFiltersProvider.isUriIgnored(uri)) ? 'context-filter' : null
        rerender()
    }
    const onDocumentChange = vscode.window.onDidChangeActiveTextEditor(editor =>
        updateIgnoreStatus(editor?.document.uri)
    )
    // Initial check for the current active editor
    updateIgnoreStatus(vscode.window.activeTextEditor?.document?.uri)

    let authStatus: AuthStatus | undefined
    const command = vscode.commands.registerCommand(STATUS_BAR_INTERACTION_COMMAND, async () => {
        telemetryRecorder.recordEvent('cody.statusbarIcon', 'clicked', {
            privateMetadata: { loggedIn: Boolean(authStatus?.authenticated) },
            billingMetadata: {
                category: 'billable',
                product: 'cody',
            },
        })

        if (!authStatus?.authenticated) {
            // Bring up the sidebar view
            void vscode.commands.executeCommand('cody.chat.focus')
            return
        }

        const workspaceConfig = vscode.workspace.getConfiguration()
        const config = getConfiguration(workspaceConfig)

        async function createFeatureToggle(
            name: string,
            description: string | undefined,
            detail: string,
            setting: string,
            getValue: (config: ClientConfiguration) => boolean | Promise<boolean>,
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

        if (errors.length > 0) {
            errors.map(error => error.error.onShow?.())
        }

        const quickPick = vscode.window.createQuickPick()
        quickPick.items = [
            // These description should stay in sync with the settings in package.json
            ...(errors.length > 0
                ? [
                      { label: 'notice', kind: vscode.QuickPickItemKind.Separator },
                      ...errors.map(error => ({
                          label: `$(alert) ${error.error.title}`,
                          description: '',
                          detail: QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX + error.error.description,
                          onSelect(): Promise<void> {
                              error.error.onSelect?.()
                              if (error.error.removeAfterSelected) {
                                  const index = errors.indexOf(error)
                                  errors.splice(index)
                                  rerender()
                              }
                              return Promise.resolve()
                          },
                      })),
                  ]
                : []),
            { label: 'notice', kind: vscode.QuickPickItemKind.Separator },
            ...(isCodyIgnoredType
                ? [
                      {
                          label: '$(debug-pause) Cody is disabled in this file',
                          description: '',
                          detail:
                              QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX +
                              (isCodyIgnoredType === 'context-filter'
                                  ? 'Your administrator has disabled Cody in this repository.'
                                  : 'Cody is disabled in this file because of your .cody/ignore file.'),
                      },
                  ]
                : []),
            { label: 'enable/disable features', kind: vscode.QuickPickItemKind.Separator },
            await createFeatureToggle(
                'Code Autocomplete',
                undefined,
                'Enable Cody-powered code autocompletions',
                'cody.autocomplete.enabled',
                c => c.autocomplete,
                false,
                [
                    {
                        iconPath: new vscode.ThemeIcon('settings-more-action'),
                        tooltip: 'Autocomplete Settings',
                        onClick: () =>
                            vscode.commands.executeCommand('workbench.action.openSettings', {
                                query: '@ext:sourcegraph.cody-ai autocomplete',
                            }),
                    } as vscode.QuickInputButton,
                ]
            ),
            await createFeatureToggle(
                'Code Actions',
                undefined,
                'Enable Cody fix and explain options in the Quick Fix menu',
                'cody.codeActions.enabled',
                c => c.codeActions
            ),
            await createFeatureToggle(
                'Code Lenses',
                undefined,
                'Enable Code Lenses in documents for quick access to Cody commands',
                'cody.commandCodeLenses',
                c => c.commandCodeLenses
            ),
            await createFeatureToggle(
                'Command Hints',
                undefined,
                'Enable hints for Cody commands such as "Opt+K to Edit" or "Opt+D to Document"',
                'cody.commandHints.enabled',
                async () => {
                    const enablement = await getGhostHintEnablement()
                    return enablement.Document || enablement.EditOrChat || enablement.Generate
                }
            ),
            { label: 'settings', kind: vscode.QuickPickItemKind.Separator },
            {
                label: '$(gear) Cody Extension Settings',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand('cody.settings.extension')
                },
            },
            {
                label: '$(symbol-namespace) Custom Commands Settings',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand('cody.menu.commands-settings')
                },
            },
            {
                label: '$(keyboard) Keyboard Shortcuts',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand(
                        'workbench.action.openGlobalKeybindings',
                        '@ext:sourcegraph.cody-ai'
                    )
                },
            },
            { label: 'feedback & support', kind: vscode.QuickPickItemKind.Separator },
            ...SupportOptionItems,
            ...FeedbackOptionItems,
            { label: `v${version}`, kind: vscode.QuickPickItemKind.Separator },
            {
                label: '$(cody-logo) Cody Release Blog',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand(
                        'vscode.open',
                        getReleaseNotesURLByIDE(version, CodyIDE.VSCode)
                    )
                },
            },
        ].filter(Boolean)
        quickPick.title = 'Cody Settings'
        quickPick.placeholder = 'Choose an option'
        quickPick.matchOnDescription = true
        quickPick.show()
        quickPick.onDidAccept(() => {
            const option = quickPick.activeItems[0] as StatusBarItem
            if (option && 'onSelect' in option) {
                option.onSelect().catch(console.error)
            }
            quickPick.hide()
        })
        quickPick.onDidTriggerItemButton(item => {
            // @ts-ignore: onClick is a custom extension to the QuickInputButton
            item?.button?.onClick?.()
            quickPick.hide()
        })
        // Debug Mode
        quickPick.buttons = [
            {
                iconPath: new vscode.ThemeIcon('bug'),
                tooltip: config.debugVerbose ? 'Check Debug Logs' : 'Turn on Debug Mode',
                onClick: () => enableVerboseDebugMode(),
            } as vscode.QuickInputButton,
        ]
        quickPick.onDidTriggerButton(async item => {
            // @ts-ignore: onClick is a custom extension to the QuickInputButton
            item?.onClick?.()
            quickPick.hide()
        })
    })

    // Reference counting to ensure loading states are handled consistently across different
    // features
    // TODO: Ensure the label is always set to the right value too.
    let openLoadingLeases = 0

    const errors: { error: StatusBarError; createdAt: number }[] = []

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
            if (!authStatus.authenticated && authStatus.showNetworkError) {
                statusBarItem.text = '$(cody-logo-heavy) Connection Issues'
                statusBarItem.tooltip = 'Resolve network issues for Cody to work again'
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
                return
            }
            if (!authStatus.authenticated) {
                statusBarItem.text = '$(cody-logo-heavy) Sign In'
                statusBarItem.tooltip = 'Sign in to get started with Cody'
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
                return
            }
        }

        if (errors.length > 0) {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
            statusBarItem.tooltip = errors[0].error.title
        } else {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.activeBackground')
        }
    }

    // Clean up all errors after a certain time so they don't accumulate forever
    function clearOutdatedErrors(): void {
        const now = Date.now()
        for (let i = errors.length - 1; i >= 0; i--) {
            const error = errors[i]
            if (
                now - error.createdAt >= ONE_HOUR ||
                (error.error.removeAfterEpoch && now - error.error.removeAfterEpoch >= 0)
            ) {
                errors.splice(i, 1)
            }
        }
        rerender()
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
        addError(error: StatusBarError) {
            const now = Date.now()
            const errorObject = { error, createdAt: now }
            errors.push(errorObject)

            if (error.removeAfterEpoch && error.removeAfterEpoch > now) {
                setTimeout(clearOutdatedErrors, Math.min(ONE_HOUR, error.removeAfterEpoch - now))
            } else {
                setTimeout(clearOutdatedErrors, ONE_HOUR)
            }

            rerender()

            return () => {
                const index = errors.indexOf(errorObject)
                if (index !== -1) {
                    errors.splice(index, 1)
                    rerender()
                }
            }
        },
        hasError(errorName: StatusBarErrorName): boolean {
            return errors.some(e => e.error.errorType === errorName)
        },
        setAuthStatus(newStatus: AuthStatus) {
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
