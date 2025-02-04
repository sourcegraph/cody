import {
    type EditModel,
    FeatureFlag,
    displayPathWithoutWorkspaceFolderPrefix,
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
    smartApplyModel: EditModel
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
    applyTimeMs: number
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
    private static readonly MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024 // 1 MB

    private featureFlagSmartApplyContextDataCollection = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.SmartApplyContextDataCollectionFlag)
    )

    public createSmartApplyLoggingRequest(params: {
        model: EditModel
        userQuery: string
        replacementCodeBlock: string
        document: vscode.TextDocument
    }): SmartApplyLoggingRequestId {
        const baseRepoContext = this.getBaseRepoContext()
        const requestId = uuid.v4() as SmartApplyLoggingRequestId
        const filePath = displayPathWithoutWorkspaceFolderPrefix(params.document.uri)
        const fileContent = params.document.getText()

        const baseContext: SmartApplyBaseContext = {
            smartApplyModel: params.model,
            ...baseRepoContext,
            userQuery: params.userQuery,
            replacementCodeBlock: params.replacementCodeBlock,
            filePath,
            fileContent,
        }
        this.activeRequests.set(requestId, baseContext)
        return requestId
    }

    public addSmartApplySelectionContext(
        requestId: SmartApplyLoggingRequestId,
        selectionType: SmartSelectionType,
        selectionRange: vscode.Range,
        selectionTimeMs: number,
        document: vscode.TextDocument
    ): void {
        const request = this.getRequest(requestId)
        if (!request) {
            return
        }
        this.activeRequests.set(requestId, {
            ...request,
            selectionType,
            selectionRange: [
                document.offsetAt(selectionRange.start),
                document.offsetAt(selectionRange.end),
            ],
            selectionTimeMs,
        })
    }

    public addSmartApplyFinalContext(requestId: SmartApplyLoggingRequestId, applyTimeMs: number): void {
        const request = this.getRequest(requestId)
        if (!request) {
            return
        }
        this.activeRequests.set(requestId, {
            ...request,
            applyTimeMs,
        })
    }

    public getSmartApplyLoggingContext(
        requestId: SmartApplyLoggingRequestId
    ): SmartApplyFinalContext | undefined {
        const request = this.activeRequests.get(requestId)
        if (!request) {
            return undefined
        }
        if (!this.shouldLogSmartApplyContextItem()) {
            return undefined
        }
        const requestSize = this.calculateCurrentRequestSizeInBytes(request)
        if (requestSize > SmartApplyContextLogger.MAX_PAYLOAD_SIZE_BYTES) {
            return undefined
        }
        // Verify that the request has the final property required.
        if (typeof (request as SmartApplyFinalContext).applyTimeMs !== 'number') {
            return undefined
        }
        return request as SmartApplyFinalContext
    }

    private calculateCurrentRequestSizeInBytes(request: SmartApplyLoggingState): number {
        const snippetSizeBytes = Buffer.byteLength(JSON.stringify(request) || '', 'utf8')
        return snippetSizeBytes
    }

    private getRequest(requestId: SmartApplyLoggingRequestId): SmartApplyLoggingState | undefined {
        return this.activeRequests.get(requestId)
    }

    private shouldLogSmartApplyContextItem(): boolean {
        if (isDotComAuthed() && this.isSmartApplyContextDataCollectionFlagEnabled()) {
            // 🚨 SECURITY: included only for DotCom users and for users in the feature flag.
            return true
        }
        return false
    }

    private getBaseRepoContext(): RepoContext | undefined {
        const gitIdentifiersForFile = gitMetadataForCurrentEditor.getGitIdentifiersForFile()
        if (!gitIdentifiersForFile?.repoName) {
            return undefined
        }
        const repoMetadata = this.repoMetaDataInstance.getRepoMetadataIfCached(
            gitIdentifiersForFile.repoName
        )
        return {
            repoName: gitIdentifiersForFile.repoName,
            commit: gitIdentifiersForFile?.commit,
            isPublic: repoMetadata?.isPublic ?? false,
        }
    }

    private isSmartApplyContextDataCollectionFlagEnabled(): boolean {
        return !!this.featureFlagSmartApplyContextDataCollection.value.last
    }

    public dispose(): void {
        this.featureFlagSmartApplyContextDataCollection.subscription.unsubscribe()
    }
}
