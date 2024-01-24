import { window } from 'vscode'

// Ask user to confirm before trying to delete the cody.json file
export async function showRemoveConfirmationInput(): Promise<'Yes' | 'No' | undefined> {
    const confirmRemove = await window.showWarningMessage(
        'Are you sure you want to remove the .vscode/cody.json file from your file system?',
        { modal: true },
        'Yes',
        'No'
    )
    return confirmRemove
}
