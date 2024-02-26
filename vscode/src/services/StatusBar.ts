import * as vscode from 'vscode'

import { type Configuration, isCodyIgnoredFile } from '@sourcegraph/cody-shared'

import { getConfiguration } from '../configuration'

import { getGhostHintEnablement } from '../commands/GhostHintDecorator'
import { FeedbackOptionItems } from './FeedbackOptions'

interface StatusBarError {
    title: string
    description: string
    errorType: StatusBarErrorName
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
}

const DEFAULT_TEXT = '$(cody-logo-heavy)'
const DEFAULT_TOOLTIP = 'Cody Settings'

const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check) '
const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0 '

const ONE_HOUR = 60 * 60 * 1000

type StatusBarErrorName = 'auth' | 'RateLimitError' | 'AutoCompleteDisabledByAdmin'

interface StatusBarItem extends vscode.QuickPickItem {
    onSelect: () => Promise<void>
}

export function createStatusBar(): CodyStatusBar {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
    statusBarItem.text = DEFAULT_TEXT
    statusBarItem.tooltip = DEFAULT_TOOLTIP
    statusBarItem.command = 'cody.status-bar.interacted'
    statusBarItem.show()

    const command = vscode.commands.registerCommand(statusBarItem.command, async () => {
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
                              const index = errors.indexOf(error)
                              errors.splice(index)
                              rerender()
                              return Promise.resolve()
                          },
                      })),
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
                'Editor Title Icon',
                undefined,
                'Enable Cody to appear in editor title menu for quick access to Cody commands',
                'cody.editorTitleCommandIcon',
                c => c.editorTitleCommandIcon
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
                'Enable hints for Edit and Chat shortcuts, displayed alongside editor selections',
                'cody.commandHints.enabled',
                getGhostHintEnablement
            ),
            await createFeatureToggle(
                'Search Context',
                'Beta',
                'Enable using the natural language search index as an Enhanced Context chat source',
                'cody.experimental.symfContext',
                c => c.experimentalSymfContext,
                false
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
            { label: 'feedback & support', kind: vscode.QuickPickItemKind.Separator },
            ...FeedbackOptionItems,
        ]
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
            statusBarItem.text = DEFAULT_TEXT
            statusBarItem.tooltip = DEFAULT_TOOLTIP
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
            if (now - error.createdAt >= ONE_HOUR) {
                errors.splice(i, 1)
            }
        }
        rerender()
    }

    // NOTE: Behind unstable feature flag and requires .cody/ignore enabled
    // Listens for changes to the active text editor and updates the status bar text
    // based on whether the active file is ignored by Cody or not.
    // If ignored, adds 'Ignored' to the status bar text.
    // Otherwise, rerenders the status bar.
    const verifyActiveEditor = (uri?: vscode.Uri) => {
        // NOTE: Non-file URIs are not supported by the .cody/ignore files and
        // are ignored by default. As they are files that a user would not expect to
        // be used by Cody, we will not display them with the "warning".
        if (uri?.scheme === 'file' && isCodyIgnoredFile(uri)) {
            statusBarItem.tooltip = 'Current file is ignored by Cody'
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        } else {
            rerender()
        }
    }
    const onDocumentChange = vscode.window.onDidChangeActiveTextEditor(e => {
        verifyActiveEditor(e?.document?.uri)
    })
    verifyActiveEditor(vscode.window.activeTextEditor?.document?.uri)

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
            const errorObject = { error, createdAt: Date.now() }
            errors.push(errorObject)
            setTimeout(clearOutdatedErrors, ONE_HOUR)
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
        dispose() {
            statusBarItem.dispose()
            command.dispose()
            onDocumentChange.dispose()
        },
    }
}
