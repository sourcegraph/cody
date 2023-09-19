import * as vscode from 'vscode'

import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { ContextProvider } from '../chat/ContextProvider'
import { isOsSupportedByApp } from '../chat/protocol'

import { LOCAL_APP_SETTINGS_DIR } from './LocalAppFsPaths'

interface AppSetupJson {
    dotcomAccessToken: string
    repoPaths: string[]
}

// Listens for when a dotcom auth token is available, and pushes it into a file
// so Cody App can use the same token.
export class LocalAppSetupPublisher implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    constructor(private readonly configProvider: ContextProvider) {
        this.disposables.push(
            configProvider.configurationChangeEvent.event(() => {
                void this.onConfigurationChanged()
            })
        )
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    public async onConfigurationChanged(): Promise<void> {
        const { accessToken, serverEndpoint } = this.configProvider.config
        if (!(accessToken && isDotCom(serverEndpoint) && isOsSupportedByApp(process.platform, process.arch))) {
            // - We need an access token.
            // - App-less onboarding is only implemented for dotcom.
            // - We need app for this platform.
            return
        }
        let settingsDirUri
        try {
            settingsDirUri = await this.ensureAppConfigDir()
        } catch {
            // There's no app on this platform, we could not create the settings
            // directory, etc.
            return
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
        const settings: AppSetupJson = {
            dotcomAccessToken: accessToken,
            repoPaths: workspaceRoot ? [workspaceRoot] : [],
        }
        void vscode.workspace.fs.writeFile(
            settingsDirUri.with({ path: `${settingsDirUri.path}/vscode.json` }),
            Buffer.from(JSON.stringify(settings), 'utf-8')
        )
    }

    // Tries to get the Cody App configuration directory, creating the directory
    // if it does not exist.
    private async ensureAppConfigDir(): Promise<vscode.Uri> {
        const settingsDirPattern = LOCAL_APP_SETTINGS_DIR.get(process.platform)
        if (!settingsDirPattern) {
            throw new Error('no app for this platform')
        }
        const homeDir = process.env.HOME
        if (!homeDir) {
            throw new Error('no home directory')
        }
        const settingsDir = settingsDirPattern.replace(/^~/, homeDir)
        const settingsDirUri = vscode.Uri.file(settingsDir)
        let settingsDirStats
        try {
            settingsDirStats = await vscode.workspace.fs.stat(settingsDirUri)
        } catch {
            // We could not stat the directory, it probably doesn't exist. Try to create it.
        }
        if (
            settingsDirStats &&
            settingsDirStats.type === vscode.FileType.Directory &&
            settingsDirStats.permissions !== undefined &&
            settingsDirStats.permissions ^ vscode.FilePermission.Readonly
        ) {
            return settingsDirUri
        }
        // Try creating the directory.
        await vscode.workspace.fs.createDirectory(settingsDirUri)
        return settingsDirUri
    }
}
