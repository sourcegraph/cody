import * as vscode from 'vscode'
import * as path from 'path'

// import { URI } from 'vscode-uri'
import { logDebug } from '../log'

import {
    isDotCom,
    type ConfigurationWithAccessToken,
    // type FileURI,
} from '@sourcegraph/cody-shared'
import type { ContextItem } from '../prompt-builder/types'
import { MessageHandler } from '../jsonrpc/jsonrpc'
import { captureException } from '../services/sentry/sentry'
import { FileURI, isFileURI } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { RankContextItem } from '../jsonrpc/context-ranking-protocol'
import { CodyEngineService } from './cody-engine'

export interface ContextRanker {
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
    'serverEndpoint'
>

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

export class ContextRankingController implements ContextRanker{

    // The cody-engine child process, if starting or started.
    private service: Promise<MessageHandler> | undefined
    // True if the service has finished starting and been initialized.
    private serviceStarted = false
    // Whether the account is a consumer account.
    private endpointIsDotcom = false
    private readonly indexLibraryPath: FileURI | undefined

    private doesFeaturesExist: boolean = false

    constructor(private readonly context: vscode.ExtensionContext, config: ContextRankerConfig) {
        this.endpointIsDotcom = isDotCom(config.serverEndpoint)
        logDebug('ContextRankingController', 'constructor')
    }

    public async start(): Promise<void> {
        logDebug('ContextRankingController', 'start')
        await this.getService()

        const repoUri = this.getRepoUri();
        if (repoUri && isFileURI(repoUri)) {
            this.computeFeatures(repoUri)
        }
    }

    private getRepoUri(): vscode.Uri | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri;
    }
    
    // Tries to compute the index at the start of the service.
    private async computeFeatures(repoDir: FileURI): Promise<void> {
        try {
            const isPrecomputeSucess = await (await this.getService()).request('context-ranking/compute-features', {
                repoPath: repoDir.fsPath,
                bm25ChunkingStrategy: 'full-file-chunks',
            })
            logDebug('ContextRankingController', 'compute-features', JSON.stringify(isPrecomputeSucess))
            this.doesFeaturesExist = isPrecomputeSucess;    
        } catch (error) {
            logDebug('ContextRankingController', 'error in feature preCompute call', captureException(error), JSON.stringify(error))
        }
    }

    private getService(): Promise<MessageHandler> {
        if (!this.service) {
            const instance = CodyEngineService.getInstance(this.context)
            this.service = instance.getService()
            instance.setupServiceHandler(this.setupContextRankingService)
        }
        return this.service
    }

    private setupContextRankingService = async (service: MessageHandler): Promise<void> => {
        logDebug('ContextRankingController', 'spawnAndBindService', 'service started, initializing')
        let indexPath = getIndexLibraryPath()
        // Tests may override the index library path
        if (this.indexLibraryPath) {
            logDebug(
                'ContextRankingController',
                'spawnAndBindService',
                'overriding index library path',
                this.indexLibraryPath
            )
            indexPath = this.indexLibraryPath
        }
        const initResult = await service.request('context-ranking/initialize', {
            indexPath: indexPath.fsPath,
        })
        logDebug(
            'LocalEmbeddingsController',
            'spawnAndBindService',
            'initialized',
            initResult,
        )
        this.serviceStarted = true
    }

    public async rankContextItems(query: string, contextItems: ContextItem[]): Promise<ContextItem[]> {
        const repoUri = this.getRepoUri();
        if (!repoUri || !this.endpointIsDotcom || !this.serviceStarted || !this.doesFeaturesExist) {
            return contextItems
        }
        
        try {
            const service = await this.getService()
            const rankItems = this.convertContextItemsToRankItems(repoUri.path, contextItems)
            const rankedItemsOrder = await service.request('context-ranking/rank-items', {
                repoPath: repoUri.path,
                bm25ChunkingStrategy: 'full-file-chunks',
                contextItems: rankItems,
                query: query,
            })
            // ToDo: Add more checks to ensure validity of reRanked Items
            if (rankedItemsOrder.length!== contextItems.length) {
                logDebug('ContextRankingController', 'rank-items', 'unexpected-response, length of reranked items does not match', 'original items', JSON.stringify(contextItems), ' reranked items', JSON.stringify(rankedItemsOrder))
                return contextItems
            }
            const reRankedContextItems = this.orderContextItemsAsRankItems(contextItems, rankedItemsOrder)
            return reRankedContextItems
        } catch (error) {
            logDebug('ContextRankingController', 'rank-items', captureException(error), error)
            return contextItems
        }
    }

    private convertContextItemsToRankItems(baseRepoUrl: string, contextItems: ContextItem[]): RankContextItem[] {
        const rankContextItems = contextItems.map((item, index) => ({
            index: index,
            filePath: item.uri?.path ? path.relative(baseRepoUrl, item.uri?.path) : '',
            content: item.text,
            source: item.source
        }))
        return rankContextItems
    }

    private orderContextItemsAsRankItems(contextItems: ContextItem[], rankedItemsOrder: RankContextItem[]): ContextItem[] {
        let orderedContextItems: ContextItem[] = []; // Initialize the array
        for (const rankItem of rankedItemsOrder) {
            const newIndex = rankItem.index;
            if(newIndex<0 || newIndex>=contextItems.length) {
                logDebug('ContextRankingController', 'length of rankItems', JSON.stringify(rankedItemsOrder), 'does not match context items', JSON.stringify(contextItems))
                return contextItems
            }
            orderedContextItems.push(contextItems[newIndex]);
        }
        return orderedContextItems;
    }
}

