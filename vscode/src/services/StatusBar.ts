import * as vscode from 'vscode'

import type { Configuration } from '@sourcegraph/cody-shared/src/configuration'

import { getConfiguration } from '../configuration'

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
    startLoading(label: string): () => void
    addError(error: StatusBarError): () => void
    hasError(error: StatusBarErrorName): boolean
}

const DEFAULT_TEXT = '$(cody-logo-heavy)'
const DEFAULT_TOOLTIP = 'Cody Settings'

const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check) '
const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0 '

const ONE_HOUR = 60 * 60 * 1000

type StatusBarErrorName = 'auth' | 'RateLimitError'

export function createStatusBar(): CodyStatusBar {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
    statusBarItem.text = DEFAULT_TEXT
    statusBarItem.tooltip = DEFAULT_TOOLTIP
    statusBarItem.command = 'cody.status-bar.interacted'
    statusBarItem.show()

    const command = vscode.commands.registerCommand(statusBarItem.command, async () => {
        const workspaceConfig = vscode.workspace.getConfiguration()
        const config = getConfiguration(workspaceConfig)

        function createFeatureToggle(
            name: string,
            description: string | undefined,
            detail: string,
            setting: string,
            getValue: (config: Configuration) => boolean,
            requiresReload: boolean = false
        ): vscode.QuickPickItem & { onSelect: () => Promise<void> } {
            const isEnabled = getValue(config)
            return {
                label: (isEnabled ? QUICK_PICK_ITEM_CHECKED_PREFIX : QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX) + name,
                description,
                detail: QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX + detail,
                onSelect: async () => {
                    await workspaceConfig.update(setting, !isEnabled, vscode.ConfigurationTarget.Global)

                    const info = name + ' ' + (isEnabled ? 'disabled' : 'enabled') + '.'
                    const response = await (requiresReload
                        ? vscode.window.showInformationMessage(info, 'Reload Window')
                        : vscode.window.showInformationMessage(info))

                    if (response === 'Reload Window') {
                        await vscode.commands.executeCommand('workbench.action.reloadWindow')
                    }
                },
            }
        }

        if (errors.length > 0) {
            errors.map(error => error.error.onShow?.())
        }

        const option = await vscode.window.showQuickPick(
            // These description should stay in sync with the settings in package.json
            [
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
                createFeatureToggle(
                    'Code Autocomplete',
                    undefined,
                    'Enable Cody-powered code autocompletions',
                    'cody.autocomplete.enabled',
                    c => c.autocomplete
                ),
                createFeatureToggle(
                    'Code Actions',
                    undefined,
                    'Enable Cody fix and explain options in the Quick Fix menu',
                    'cody.codeActions.enabled',
                    c => c.codeActions
                ),
                createFeatureToggle(
                    'Editor Title Icon',
                    undefined,
                    'Enable Cody to appear in editor title menu for quick access to Cody commands',
                    'cody.editorTitleCommandIcon',
                    c => c.editorTitleCommandIcon
                ),
                createFeatureToggle(
                    'Code Lenses',
                    undefined,
                    'Enable Code Lenses in documents for quick access to Cody commands',
                    'cody.commandCodeLenses',
                    c => c.commandCodeLenses
                ),
                createFeatureToggle(
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
                        await vscode.commands.executeCommand('cody.settings.commands')
                    },
                },
                { label: 'feedback & support', kind: vscode.QuickPickItemKind.Separator },
                ...FeedbackOptionItems,
            ],
            {
                title: 'Cody Settings',
                placeHolder: 'Choose an option',
                matchOnDescription: true,
            }
        )

        if (option && 'onSelect' in option) {
            option.onSelect().catch(console.error)
        }
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

    return {
        startLoading(label: string) {
            openLoadingLeases++
            statusBarItem.tooltip = label
            rerender()

            let didClose = false
            return () => {
                if (didClose) {
                    return
                }
                didClose = true

                openLoadingLeases--
                rerender()
            }
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
        },
    }
}
