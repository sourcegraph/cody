import type * as vscode from 'vscode'
import { emptyEvent } from '../../vscode/src/testutils/emptyEvent'

export class AgentQuickPick<T extends vscode.QuickPickItem> implements vscode.QuickPick<T> {
    value = ''
    placeholder: string | undefined
    onDidChangeValue: vscode.Event<string> = emptyEvent()
    onDidAccept: vscode.Event<void> = emptyEvent()
    buttons: readonly vscode.QuickInputButton[] = []
    onDidTriggerButton: vscode.Event<vscode.QuickInputButton> = emptyEvent()
    onDidTriggerItemButton: vscode.Event<vscode.QuickPickItemButtonEvent<T>> = emptyEvent()
    items: readonly T[] = []
    canSelectMany = false
    matchOnDescription = false
    matchOnDetail = false
    keepScrollPosition?: boolean | undefined
    activeItems: readonly T[] = []
    onDidChangeActive: vscode.Event<readonly T[]> = emptyEvent()
    selectedItems: readonly T[] = []
    onDidChangeSelection: vscode.Event<readonly T[]> = emptyEvent()
    title: string | undefined
    step: number | undefined
    totalSteps: number | undefined
    enabled = false
    busy = false
    ignoreFocusOut = false
    show(): void {
        throw new Error('Method not implemented.')
    }
    hide(): void {
        throw new Error('Method not implemented.')
    }
    onDidHide: vscode.Event<void> = emptyEvent()
    dispose(): void {
        throw new Error('Method not implemented.')
    }
}
