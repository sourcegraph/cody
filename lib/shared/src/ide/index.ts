import type * as vscode from 'vscode'

export let ide: typeof vscode =
    'IDE is not initialized. To fix this problem, call the `setIDE` function from @sourcegraph/cody-shared/src/ide.' as unknown as typeof vscode
export function setIDE(newIDE: Partial<typeof vscode>): void {
    ide = newIDE as typeof vscode
}
