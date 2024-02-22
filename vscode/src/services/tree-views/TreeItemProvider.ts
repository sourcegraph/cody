import * as vscode from 'vscode'

export class CodyTreeItem extends vscode.TreeItem {
    public children: CodyTreeItem[] | undefined

    constructor(
        public readonly id: string,
        title: string,
        icon?: string,
        command?: {
            command: string
            args?: any[]
        },
        contextValue?: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        children?: CodyTreeItem[]
    ) {
        super(title, collapsibleState)
        this.id = id
        if (icon) {
            this.iconPath = new vscode.ThemeIcon(icon)
        }
        if (command) {
            this.command = {
                command: command.command,
                title,
                arguments: command.args,
            }
        }
        if (contextValue) {
            this.contextValue = contextValue
        }
        this.children = children
    }
    public async loadChildNodes(): Promise<CodyTreeItem[] | undefined> {
        await Promise.resolve()
        return this.children
    }
}
