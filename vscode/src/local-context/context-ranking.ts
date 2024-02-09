import * as vscode from 'vscode'
// import { URI } from 'vscode-uri'
import { logDebug } from '../log'

// import {
//     isDotCom,
//     type FileURI,
// } from '@sourcegraph/cody-shared'
import type { ContextItem } from '../prompt-builder/types'
import { MessageHandler } from '../jsonrpc/jsonrpc'
import { spawnBfg } from '../graph/bfg/spawn-bfg'
import { captureException } from '../services/sentry/sentry'
import { FileURI, isFileURI } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { RankContextItem } from '../jsonrpc/context-ranking-protocol'

export interface ContextRanker {
    rankContextItems(query: string, contextItems: ContextItem[]): Promise<ContextItem[]>   
}

export function createContextRankingController(
    context: vscode.ExtensionContext,
): ContextRankingController {
    return new ContextRankingController(context)
}

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

    constructor(private readonly context: vscode.ExtensionContext) {
        logDebug('ContextRankingController', 'constructor')
    }

    public async start(): Promise<void> {
        logDebug('ContextRankingController', 'start')
        await this.getService()
        const repoUri = vscode.workspace.workspaceFolders?.[0]?.uri
        if (repoUri && isFileURI(repoUri)) {
            await this.eagerlyLoad(repoUri)
        }
    }
    
    // Tries loading the features at the start of the service and if not exist, try compute the features
    private async eagerlyLoad(repoDir: FileURI): Promise<boolean> {
        try {
            const service = await this.getService()
            const doesFeaturesExist = await service.request(
                'context-ranking/load-features',
                repoDir.fsPath
            )
            if(!doesFeaturesExist) {
                // Initialize the feature computation without blocking
                void (async () => {
                    try {
                        const featureComputationRes = await (await this.getService()).request('context-ranking/compute-features', {
                            repoPath: repoDir.fsPath,
                            BM25ChunkingStrategy: 'file-level-chunking',
                        })
                        logDebug('ContextRankingController', 'compute-features', JSON.stringify(featureComputationRes))
                        const doesFeaturesExist = await (await this.getService()).request(
                            'context-ranking/load-features',
                            repoDir.fsPath
                        )
                        this.doesFeaturesExist = doesFeaturesExist;    
                    } catch (error) {
                        logDebug('ContextRankingController', 'eagerlyLoad', captureException(error), JSON.stringify(error))
                    }
                })()
                this.doesFeaturesExist = false;
            }
            this.doesFeaturesExist = true;
        } catch (error: any) {
            logDebug('ContextRankingController', 'eagerlyLoad', captureException(error), JSON.stringify(error))
            this.doesFeaturesExist = false
        }
        return this.doesFeaturesExist
    }

    private getService(): Promise<MessageHandler> {
        if (!this.service) {
            this.service = this.spawnAndBindService(this.context)
        }
        return this.service
    }

    private async spawnAndBindService(context: vscode.ExtensionContext): Promise<MessageHandler> {
        const service = await new Promise<MessageHandler>((resolve, reject) => {
            spawnBfg(context, reject).then(
                bfg => resolve(bfg),
                error => {
                    captureException(error)
                    reject(error)
                }
            )
        })
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
        return service
    }

    public async rankContextItems(query: string, contextItems: ContextItem[]): Promise<ContextItem[]> {
        // if (!this.endpointIsDotcom) {
        //     return contextItems
        // }
        // if (!this.serviceStarted || !this.doesFeaturesExist) {
        //     return contextItems
        // }
        console.log(`values: ${this.endpointIsDotcom}, ${this.serviceStarted}`)
        try {
            const service = await this.getService()
            const rankItems = this.convertContextItemsToRankItems(contextItems)
            const rankedItemsOrder = await service.request('context-ranking/rank-items', {
                rankContextItem: rankItems,
                query: query,
            })
            // ToDo: Add more checks to ensure validity of reRanked Items
            if (rankedItemsOrder.rankContextItem.length!== contextItems.length) {
                logDebug('ContextRankingController', 'rank-items', 'unexpected-response, length of reranked items does not match', 'original items', JSON.stringify(contextItems), ' reranked items', JSON.stringify(rankedItemsOrder.rankContextItem))
                return contextItems
            }
            const reRankedContextItems = this.orderContextItemsAsRankItems(contextItems, rankedItemsOrder.rankContextItem)
            return reRankedContextItems
        } catch (error) {
            logDebug('ContextRankingController', 'rank-items', captureException(error), error)
            return contextItems
        }
    }

    private convertContextItemsToRankItems(contextItems: ContextItem[]): RankContextItem[] {
        const rankContextItems = contextItems.map((item, index) => ({
            index: index,
            filePath: item.uri?.path,
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





