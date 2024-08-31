import type * as vscode from 'vscode'
import { migrateChatHistoryCODY3538 } from './chat-id-migration-CODY3538'

export default async function migrate(storage: vscode.Memento): Promise<void> {
    await migrateChatHistoryCODY3538(storage)
}
