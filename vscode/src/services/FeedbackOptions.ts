import * as vscode from 'vscode'

import { CODY_DOC_URL, CODY_FEEDBACK_URL, CODY_SUPPORT_URL, DISCORD_URL } from '../chat/protocol'

// Support items for paid users (e.g Enterprise Users and Cody Pro Users)
export const PremiumSupportItems = [
    {
        label: '$(question) Cody Support',
        async onSelect(): Promise<void> {
            await vscode.env.openExternal(vscode.Uri.parse(CODY_SUPPORT_URL.href))
        },
    },
]

export const FeedbackOptionItems = [
    {
        label: '$(remote-explorer-documentation) Cody Documentation',
        async onSelect(): Promise<void> {
            await vscode.env.openExternal(vscode.Uri.parse(CODY_DOC_URL.href))
        },
    },
    {
        label: '$(feedback) Cody Feedback',
        async onSelect(): Promise<void> {
            await vscode.env.openExternal(vscode.Uri.parse(CODY_FEEDBACK_URL.href))
        },
    },
    {
        label: '$(organization) Cody Discord Channel',
        async onSelect(): Promise<void> {
            await vscode.env.openExternal(vscode.Uri.parse(DISCORD_URL.href))
        },
    },
]

const FeedbackQuickPickOptions = { title: 'Cody Feedback & Support', placeholder: 'Choose an option' }

export const showFeedbackSupportQuickPick = async (): Promise<void> => {
    const selectedItem = await vscode.window.showQuickPick(FeedbackOptionItems, FeedbackQuickPickOptions)
    await selectedItem?.onSelect()
}
