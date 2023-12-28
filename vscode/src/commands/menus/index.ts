import { platform } from 'os'

import { debounce } from 'lodash'
import { commands, QuickPickItem, QuickPickOptions, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'

import { CustomCommandsItem } from '../utils'
import {
    ASK_QUESTION_COMMAND,
    CustomCommandConfigMenuItems,
    EDIT_COMMAND,
    menu_buttons,
    menu_options,
    QuickPickItemWithSlashCommand,
} from '../utils/menu'

import { CodyCommand, CustomCommandsBuilderMenu } from './CustomCommandBuilderMenu'

interface CommandMenuResponse {
    selectedItem: QuickPickItem | QuickPickItemWithSlashCommand
    input: string
}

const slashCommandRegex = /^\/[A-Za-z]+/
function isSlashCommand(value: string): boolean {
    return slashCommandRegex.test(value)
}

const labelReplacements: Record<string, (label: string) => string> = {
    [ASK_QUESTION_COMMAND.slashCommand]: label => `${label} [question]`,
    [EDIT_COMMAND.slashCommand]: label => `${label} [instruction]`,
}

function normalize(input: string): string {
    return input.trim().toLowerCase()
}

export async function showCommandMenu(
    items: (QuickPickItem | QuickPickItemWithSlashCommand)[]
): Promise<CommandMenuResponse> {
    const options = {
        title: `Cody Commands (Shortcut: ${platform() === 'darwin' ? '⌥' : 'Alt+'}C)`,
        placeHolder: 'Search for a command or enter your question here...',
    }

    const defaultItems: (QuickPickItem | QuickPickItemWithSlashCommand)[] = items.map(item => {
        const replaceFn = 'slashCommand' in item ? labelReplacements[item.slashCommand] : undefined
        if (replaceFn) {
            return { ...item, label: replaceFn(item.label) }
        }
        return item
    })

    return new Promise(resolve => {
        const quickPick = window.createQuickPick()
        quickPick.items = defaultItems
        quickPick.title = options.title
        quickPick.placeholder = options.placeHolder
        quickPick.matchOnDescription = true

        quickPick.buttons = [menu_buttons.gear]

        const fallbackCommands = new Set([menu_options.chat.slashCommand, menu_options.fix.slashCommand])
        const updateItems = debounce((value: string) => {
            const fallbackItems: QuickPickItem[] = items.reduce((acc, item) => {
                if ('slashCommand' in item && fallbackCommands.has(item.slashCommand)) {
                    acc.push({ ...item, label: `${item.label} "${value}"`, alwaysShow: true })
                }
                return acc
            }, [] as QuickPickItem[])

            quickPick.items = fallbackItems
        }, 200)
        quickPick.onDidChangeValue(value => {
            const normalizedValue = normalize(value)
            quickPick.matchOnDescription = false

            if (isSlashCommand(normalizedValue)) {
                const [slashCommand] = normalizedValue.split(' ')
                const matchingCommands = defaultItems.filter(
                    item => 'slashCommand' in item && item.slashCommand?.toLowerCase().startsWith(slashCommand)
                )
                if (matchingCommands.length > 0) {
                    // show only item for a matching slash command (ignore other label or description matches)
                    quickPick.items = matchingCommands.map(command => ({ ...command, alwaysShow: true }))
                    return
                }

                // show no matching commands item
                quickPick.items = [{ label: 'No matching commands', alwaysShow: true }]
                return
            }

            const hasMatch = items.some(item =>
                // label may include placeholder which we don't want to match against - use slash command instead
                ['slashCommand' in item ? item.slashCommand : item.label, item.description].some(
                    str => str?.toLowerCase().includes(normalizedValue)
                )
            )
            if (!normalizedValue || hasMatch) {
                // show default items
                quickPick.items = defaultItems
                quickPick.matchOnDescription = true
                return
            }

            // show fallback items
            updateItems(normalizedValue)
        })

        // On gear icon click
        quickPick.onDidTriggerButton(async () => {
            quickPick.hide()
            await commands.executeCommand('cody.settings.commands')
        })

        quickPick.onDidAccept(() => {
            const selection = quickPick.activeItems[0]
            let value = normalize(quickPick.value)
            if (isSlashCommand(value)) {
                const [, ...rest] = value.split(' ')
                value = rest.join(' ')
            }
            resolve({ selectedItem: selection, input: value })
            quickPick.hide()
        })
        quickPick.show()
    })
}

export async function showCustomCommandMenu(items: QuickPickItem[]): Promise<QuickPickItem> {
    const CustomCommandsMenuOptions: QuickPickOptions = {
        title: 'Cody: Custom Commands (Beta)',
        placeHolder: 'Search command to run...',
    }

    return new Promise(resolve => {
        const quickPick = window.createQuickPick()
        quickPick.items = items
        quickPick.title = CustomCommandsMenuOptions.title
        quickPick.placeholder = CustomCommandsMenuOptions.placeHolder
        quickPick.ignoreFocusOut = false

        quickPick.buttons = [menu_buttons.back]

        quickPick.onDidAccept(() => {
            const selection = quickPick.activeItems[0]
            resolve(selection)
            quickPick.hide()
        })

        quickPick.onDidTriggerButton(async () => {
            quickPick.hide()
            await commands.executeCommand('cody.action.commands.menu')
        })

        quickPick.show()
    })
}

/**
 * Shows the custom command configuration menu and returns the selected item.
 */
export async function showCommandConfigMenu(): Promise<CustomCommandsItem> {
    const CustomCommandConfigMenuOptions = {
        title: 'Cody: Configure Custom Commands (Beta)',
        placeHolder: 'Choose an option',
    }

    return new Promise(resolve => {
        const quickPick = window.createQuickPick()
        quickPick.items = CustomCommandConfigMenuItems
        quickPick.title = CustomCommandConfigMenuOptions.title
        quickPick.placeholder = CustomCommandConfigMenuOptions.placeHolder

        quickPick.buttons = [menu_buttons.back]

        // on item button click
        quickPick.onDidTriggerItemButton(item => {
            const selection = item.item as CustomCommandsItem
            selection.id = item.button.tooltip === 'delete' ? 'delete' : 'open'
            resolve(selection)
            quickPick.hide()
        })

        quickPick.onDidAccept(() => {
            const selection = quickPick.activeItems[0] as CustomCommandsItem
            resolve(selection)
            quickPick.hide()
        })

        quickPick.onDidTriggerButton(async () => {
            quickPick.hide()
            await commands.executeCommand('cody.action.commands.menu')
        })

        quickPick.show()
    })
}

/**
 * Show Menu for creating a new prompt via UI using the input box and quick pick without having to manually edit the cody.json file
 */
export async function showNewCustomCommandMenu(commands: Map<string, CodyPrompt>): Promise<CodyCommand | null> {
    const builder = new CustomCommandsBuilderMenu()
    return builder.start(commands)
}
