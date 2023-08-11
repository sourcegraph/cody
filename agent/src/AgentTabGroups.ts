import type * as vscode from 'vscode'

export class AgentTabGroups implements vscode.TabGroups {
    all: vscode.TabGroup[] = []
    activeTabGroup: vscode.TabGroup
    public onDidChangeTabGroups: vscode.Event<vscode.TabGroupChangeEvent>
    public onDidChangeTabs: vscode.Event<vscode.TabChangeEvent>
    public close(): Thenable<boolean> {
        throw new Error('Method not implemented.')
    }
}
