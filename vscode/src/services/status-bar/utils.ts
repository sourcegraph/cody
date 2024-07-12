import * as vscode from 'vscode'

import type { Configuration } from '@sourcegraph/cody-shared'
import { isCurrentFileIgnored } from '../../cody-ignore/utils'
import { getGhostHintEnablement } from '../../commands/GhostHintDecorator'
import { getConfiguration } from '../../configuration'
import { FeedbackOptionItems, SupportOptionItems } from '../FeedbackOptions'
import { enableVerboseDebugMode } from '../utils/export-logs'
import { CodyStatusError } from './CodyStatusError'
import type { StatusBarItem } from './types'

const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check) '
const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0 '

const workspaceConfig = vscode.workspace.getConfiguration()

const quickPick: vscode.QuickPick<StatusBarItem> = vscode.window.createQuickPick()

export async function openStatusBarQuickPicks(): Promise<void> {
    const errors = CodyStatusError.errors
    const isCodyIgnoredType = await isCurrentFileIgnored()

    // Debug Mode
    quickPick.buttons = [
        {
            iconPath: new vscode.ThemeIcon('bug'),
            tooltip: getConfiguration(workspaceConfig).debugVerbose
                ? 'Check Debug Logs'
                : 'Turn on Debug Mode',
            onClick: () => enableVerboseDebugMode(),
        } as vscode.QuickInputButton,
    ]

    quickPick.items = [
        // These description should stay in sync with the settings in package.json
        ...(errors.length > 0
            ? [
                  { label: 'notice', kind: vscode.QuickPickItemKind.Separator },
                  ...errors.map(error => ({
                      label: `$(alert) ${error.title}`,
                      description: '',
                      detail: QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX + error.description,
                      onSelect(): Promise<void> {
                          error.onSelect?.()
                          if (error.removeAfterSelected) {
                              const index = errors.indexOf(error)
                              errors.splice(index)
                              // rerender()
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
        { label: 'feedback & support', kind: vscode.QuickPickItemKind.Separator },
        ...SupportOptionItems,
        ...FeedbackOptionItems,
    ].filter(Boolean) as StatusBarItem[]
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

    quickPick.onDidTriggerButton(async item => {
        // @ts-ignore: onClick is a custom extension to the QuickInputButton
        item?.onClick?.()
        quickPick.hide()
    })

    if (errors.length > 0) {
        errors.map(error => error.onShow?.())
    }
}

async function createFeatureToggle(
    name: string,
    description: string | undefined,
    detail: string,
    setting: string,
    getValue: (config: Configuration) => boolean | Promise<boolean>,
    requiresReload = false,
    buttons: readonly vscode.QuickInputButton[] | undefined = undefined
): Promise<StatusBarItem> {
    const config = getConfiguration(workspaceConfig)
    const isEnabled = await getValue(config)
    return {
        label: (isEnabled ? QUICK_PICK_ITEM_CHECKED_PREFIX : QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX) + name,
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
