import type * as vscode from 'vscode'
import { spawnBfg } from '../graph/bfg/spawn-bfg'
import type { MessageHandler } from '../jsonrpc/jsonrpc'
import { logDebug } from '../log'
import { captureException } from '../services/sentry/sentry'

export class CodyEngineService {
    // Starting this service leads to spawning seperate codyEngine process.
    // Making this singleton helps ensure only single instance of engine running.
    private static instance: CodyEngineService | null = null
    private service: Promise<MessageHandler> | undefined

    // Ensure only one instance starts the process at a time.

    private constructor(private readonly context: vscode.ExtensionContext) {
        logDebug('CodyEngineService', 'constructor')
    }

    public static getInstance(context: vscode.ExtensionContext): CodyEngineService {
        if (!CodyEngineService.instance) {
            CodyEngineService.instance = new CodyEngineService(context)
        }
        return CodyEngineService.instance
    }

    public async getService(
        serviceSetupCB: (service: MessageHandler) => Promise<void>
    ): Promise<MessageHandler> {
        const service = await this.initService()
        await serviceSetupCB(service)
        return service
    }

    private initService(): Promise<MessageHandler> {
        if (!this.service) {
            this.service = this.spawnAndBindService()
        }
        return this.service
    }

    private async spawnAndBindService(): Promise<MessageHandler> {
        const service = await new Promise<MessageHandler>((resolve, reject) => {
            spawnBfg(this.context, reject).then(
                bfg => resolve(bfg),
                error => {
                    captureException(error)
                    reject(error)
                }
            )
        })
        logDebug('CodyEngineService', 'spawnAndBindService', 'service started, initializing')
        return service
    }
}
