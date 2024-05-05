import Anthropic from '@anthropic-ai/sdk'
import * as vscode from 'vscode'
import type { SymfRunner } from '../local-context/symf'
import { MinionController, ReactPanelController } from './MinionController'

export async function createNewMinionPanel(
    extensionUri: vscode.Uri,
    symf: SymfRunner | null
): Promise<void> {
    const webviewPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webviews')
    const panel = vscode.window.createWebviewPanel(
        'cody.minion.panel',
        'CodyX',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            enableFindWidget: true,
            localResourceRoots: [webviewPath],
            enableCommandUris: true,
        }
    )

    const assetRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webviews')

    const anthropicKey = vscode.workspace
        .getConfiguration('cody')
        .get<string>('experimental.minion.anthropicKey')
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    // TODO(beyang): do we need to store this somewhere? maybe need a PanelManager class
    await ReactPanelController.createAndInit<MinionController>((): MinionController => {
        return new MinionController(symf, anthropic, panel, assetRoot, () => {})
    })
}
