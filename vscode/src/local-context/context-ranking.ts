import * as path from 'path'
import * as vscode from 'vscode'
import { logDebug } from '../log'

import { type ConfigurationWithAccessToken, isDotCom } from '@sourcegraph/cody-shared'
import { type ContextItem, type FileURI, isFileURI } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import type { RankContextItem, RankerPrediction } from '../jsonrpc/context-ranking-protocol'
import type { MessageHandler } from '../jsonrpc/jsonrpc'
import { captureException } from '../services/sentry/sentry'
import { CodyEngineService } from './cody-engine'

interface ContextRanker {
    rankContextItems(query: string, contextItems: ContextItem[]): Promise<ContextItem[]>
}

export function createContextRankingController(
    context: vscode.ExtensionContext,
    config: ContextRankerConfig
): ContextRankingController {
    return new ContextRankingController(context, config)
}

export type ContextRankerConfig = Pick<
    ConfigurationWithAccessToken,
    'serverEndpoint' | 'accessToken'
> & { experimentalChatContextRanker: boolean | undefined }

function getIndexLibraryPath(): FileURI {
    switch (process.platform) {
        case 'darwin':
            return URI.file(`${process.env.HOME}/Library/Caches/com.sourcegraph.cody/context-ranking`)
        case 'linux':
            return URI.file(`${process.env.HOME}/.cache/com.sourcegraph.cody/context-ranking`)
        case 'win32':
            return URI.file(`${process.env.LOCALAPPDATA}\\com.sourcegraph.cody\\context-ranking`)
        default:
            throw new Error(`Unsupported platform: ${process.platform}`)
    }
}

export class ContextRankingController implements ContextRanker {
    // The cody-engine child process, if starting or started.
    private service: Promise<MessageHandler> | undefined
    // True if the service has finished starting and been initialized.
    private serviceStarted = false
    // Whether the account is a consumer account.
    private endpointIsDotcom = false
    private accessToken: string | undefined
    private readonly indexLibraryPath: FileURI | undefined

    constructor(
        private readonly context: vscode.ExtensionContext,
        config: ContextRankerConfig
    ) {
        this.endpointIsDotcom = isDotCom(config.serverEndpoint)
        this.accessToken = config.accessToken || undefined
        logDebug('ContextRankingController', 'constructor')
    }

    public async start(): Promise<void> {
        logDebug('ContextRankingController', 'start')
        await this.getService()

        const repoUri = this.getRepoUri()
        if (repoUri && isFileURI(repoUri)) {
            this.computeFeatures(repoUri)
        }
    }

    public async setAccessToken(serverEndpoint: string, token: string | null): Promise<void> {
        const endpointIsDotcom = isDotCom(serverEndpoint)
        logDebug(
            'ContextRankingController',
            'setAccessToken',
            endpointIsDotcom ? 'is dotcom' : 'not dotcom'
        )
        this.endpointIsDotcom = endpointIsDotcom
        if (token === this.accessToken) {
            return Promise.resolve()
        }
        this.accessToken = token || undefined
    }

    private getRepoUri(): vscode.Uri | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri
    }

    // Tries to compute the index at the start of the service.
    private async computeFeatures(repoDir: FileURI): Promise<void> {
        try {
            await (await this.getService()).request('context-ranking/compute-features', {
                repoPath: repoDir.fsPath,
            })
        } catch (error) {
            logDebug(
                'ContextRankingController',
                'error in feature preCompute call',
                captureException(error),
                JSON.stringify(error)
            )
        }
    }

    private getService(): Promise<MessageHandler> {
        if (!this.service) {
            const instance = CodyEngineService.getInstance(this.context)
            this.service = instance.getService(this.setupContextRankingService)
        }
        return this.service
    }

    private setupContextRankingService = async (service: MessageHandler): Promise<void> => {
        let indexPath = getIndexLibraryPath()
        // Tests may override the index library path
        if (this.indexLibraryPath) {
            indexPath = this.indexLibraryPath
        }
        if (this.accessToken) {
            await service.request('context-ranking/initialize', {
                indexPath: indexPath.fsPath,
                accessToken: this.accessToken,
            })
            this.serviceStarted = true
        } else {
            logDebug('ContextRankingController', 'setupContextRankingService', 'no access token found')
        }
    }

    public async rankContextItems(query: string, contextItems: ContextItem[]): Promise<ContextItem[]> {
        const repoUri = this.getRepoUri()
        if (!repoUri || !this.endpointIsDotcom || !this.serviceStarted) {
            return contextItems
        }

        try {
            const service = await this.getService()
            const rankItems = this.convertContextItemsToRankItems(repoUri.fsPath, contextItems)
            const rankedItemsOrder = await service.request('context-ranking/rank-items', {
                repoPath: repoUri.path,
                contextItems: rankItems,
                query: query,
            })

            if (rankedItemsOrder.prediction.length !== contextItems.length) {
                return contextItems
            }
            const reRankedContextItems = this.orderContextItemsAsRankItems(
                contextItems,
                rankedItemsOrder.prediction
            )
            return reRankedContextItems
        } catch (error) {
            return contextItems
        }
    }

    private convertContextItemsToRankItems(
        baseRepoPath: string,
        contextItems: ContextItem[]
    ): RankContextItem[] {
        const rankContextItems = contextItems.map((item, index) => ({
            document_id: index,
            filePath: item.uri?.path ? path.relative(baseRepoPath, item.uri?.path) : '',
            content: item.content ?? '',
            source: item.source,
        }))
        return rankContextItems
    }

    private orderContextItemsAsRankItems(
        contextItems: ContextItem[],
        rankedItemsOrder: RankerPrediction[]
    ): ContextItem[] {
        rankedItemsOrder.sort((a, b) => b.score - a.score)
        const orderedContextItems: ContextItem[] = []
        for (const item of rankedItemsOrder) {
            const newIndex = item.document_id
            if (newIndex < 0 || newIndex >= contextItems.length) {
                return contextItems
            }
            orderedContextItems.push(contextItems[newIndex])
        }
        return orderedContextItems
    }
}
