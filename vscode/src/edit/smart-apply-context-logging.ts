import {
    FeatureFlag,
    featureFlagProvider,
    isDotComAuthed,
    storeLastValue,
} from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import type * as vscode from 'vscode'
import type { SmartSelectionType } from '../edit/prompt/smart-apply'
import { gitMetadataForCurrentEditor } from '../repository/git-metadata-for-editor'
import { GitHubDotComRepoMetadata } from '../repository/githubRepoMetadata'

export type SmartApplyLoggingRequestId = string

interface RepoContext {
    repoName?: string
    commit?: string
    isPublic?: boolean
}

interface SmartApplyBaseContext extends RepoContext {
    userQuery: string
    replacementCodeBlock: string
    filePath: string
    fileContent: string
}

interface SmartApplySelectionContext extends SmartApplyBaseContext {
    selectionType: SmartSelectionType
    selectionRange: [number, number]
    selectionTimeMs: number
}

interface SmartApplyFinalContext extends SmartApplySelectionContext {
    applyTime: number
}

export type SmartApplyLoggingState =
    | SmartApplyBaseContext
    | SmartApplySelectionContext
    | SmartApplyFinalContext

/**
 * Logs the context used to generate the smart-apply selection.
 */
export class SmartApplyContextLogger {
    /**
     * Stores the SmartApplyContext for each request ID.
     */
    private activeRequests = new LRUCache<SmartApplyLoggingRequestId, SmartApplyLoggingState>({
        max: 20,
    })
    private repoMetaDataInstance = GitHubDotComRepoMetadata.getInstance()

    private featureFlagSmartApplyContextDataCollection = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.SmartApplyContextDataCollectionFlag)
    )

    public async createSmartApplyLoggingRequest(params: {
        userQuery: string
        replacementCodeBlock: string
        filePath: string
        fileContent: string
    }): Promise<SmartApplyLoggingRequestId> {
        const baseRepoContext = await this.getBaseRepoContext()
        const requestId = uuid.v4() as SmartApplyLoggingRequestId
        const baseContext: SmartApplyBaseContext = {
            ...baseRepoContext,
            ...params,
        }
        this.activeRequests.set(requestId, baseContext)
        return requestId
    }

    public async addSmartApplySelectionContext(
        requestId: SmartApplyLoggingRequestId,
        selectionType: SmartSelectionType,
        selectionRange: vscode.Range,
        selectionTimeMs: number
    ): Promise<void> {
        const request = await this.getRequestContext(requestId)
        if (!request) {
            return
        }
        this.activeRequests.set(requestId, {
            ...request,
            selectionType,
            selectionRange: [selectionRange.start.line, selectionRange.end.line],
            selectionTimeMs,
        })
    }

    public async addSmartApplyFinalContext(
        requestId: SmartApplyLoggingRequestId,
        applyTime: number
    ): Promise<void> {
        const request = await this.getRequestContext(requestId)
        if (!request) {
            return
        }
        this.activeRequests.set(requestId, {
            ...request,
            applyTime,
        })
    }

    public async getSmartApplyLoggingContext(
        requestId: SmartApplyLoggingRequestId
    ): Promise<SmartApplyFinalContext | undefined> {
        const request = this.activeRequests.get(requestId)
        if (!request) {
            return undefined
        }
        if (!this.shouldLogSmartApplyContextItem(request.isPublic)) {
            return undefined
        }
        // Verify that the request has the final property required.
        if (typeof (request as SmartApplyFinalContext).applyTime !== 'number') {
            return undefined
        }
        return request as SmartApplyFinalContext
    }

    public async getRequestContext(
        requestId: SmartApplyLoggingRequestId
    ): Promise<SmartApplyLoggingState | undefined> {
        return this.activeRequests.get(requestId)
    }

    private async shouldLogSmartApplyContextItem(isPublicRepo: boolean | undefined): Promise<boolean> {
        const isDotComUser = isDotComAuthed()
        if (isDotComUser && isPublicRepo && this.isSmartApplyContextDataCollectionFlagEnabled()) {
            // 🚨 SECURITY: included only for DotCom users with public repos and for users in the feature flag.
            return true
        }
        return false
    }

    private async getBaseRepoContext(): Promise<RepoContext | undefined> {
        const gitIdentifiersForFile = gitMetadataForCurrentEditor.getGitIdentifiersForFile()
        if (!gitIdentifiersForFile?.repoName) {
            return undefined
        }
        const repoMetadata = await this.repoMetaDataInstance.getRepoMetadataUsingRepoName(
            gitIdentifiersForFile.repoName
        )
        return {
            repoName: gitIdentifiersForFile.repoName,
            commit: gitIdentifiersForFile?.commit,
            isPublic: repoMetadata?.isPublic,
        }
    }

    private isSmartApplyContextDataCollectionFlagEnabled(): boolean {
        return !!this.featureFlagSmartApplyContextDataCollection.value.last
    }

    public dispose(): void {
        this.featureFlagSmartApplyContextDataCollection.subscription.unsubscribe()
    }
}
