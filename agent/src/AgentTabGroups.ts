import type * as vscode from 'vscode'
import { emptyEvent } from '../../vscode/src/testutils/emptyEvent'

export class AgentTabGroups implements vscode.TabGroups {
    public all: vscode.TabGroup[] = []
    public activeTabGroup: vscode.TabGroup = {
        activeTab: undefined,
        isActive: true,
        tabs: [],
        viewColumn: 1,
    }
    public onDidChangeTabGroups: vscode.Event<vscode.TabGroupChangeEvent> = emptyEvent()
    public onDidChangeTabs: vscode.Event<vscode.TabChangeEvent> = emptyEvent()
    public close(): Thenable<boolean> {
        throw new Error('Method not implemented.')
    }
    public reset(): void {
        while (this.all.length > 0) {
            this.all.pop()
        }
    }
}
