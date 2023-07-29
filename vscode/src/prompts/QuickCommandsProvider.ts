import * as vscode from 'vscode'

export async function quickChatInput(): Promise<void> {
    const humanInput = await vscode.window.showInputBox({
        prompt: 'Ask Cody a question...',
        placeHolder: 'ex. What is a class in Typescript?',
        validateInput: (input: string) => (input ? null : 'Please enter a question.'),
    })
    if (humanInput) {
        await vscode.commands.executeCommand('cody.action.chat', humanInput)
    }
}
