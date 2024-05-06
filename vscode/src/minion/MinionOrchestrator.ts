import Anthropic from '@anthropic-ai/sdk'
import * as vscode from 'vscode'
import type { SymfRunner } from '../local-context/symf'
import { MinionController, ReactPanelController } from './MinionController'

export class MinionOrchestrator implements vscode.Disposable {
    private minions: MinionController[] = []
    private disposables: vscode.Disposable[] = []

    constructor(
        private extensionUri: vscode.Uri,
        private symf: SymfRunner | undefined
    ) {}

    public dispose() {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    public async createNewMinionPanel(): Promise<void> {
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
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

        const assetRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')

        const anthropicKey = vscode.workspace
            .getConfiguration('cody')
            .get<string>('experimental.minion.anthropicKey')
        const anthropic = new Anthropic({ apiKey: anthropicKey })

        // TODO(beyang): do we need to store this somewhere? maybe need a PanelManager class
        const minion = await ReactPanelController.createAndInit<MinionController>(
            (): MinionController => {
                return new MinionController(this.symf, anthropic, panel, assetRoot, () => {})
            }
        )
        this.disposables.push(minion)
    }
}
