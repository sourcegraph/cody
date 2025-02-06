import {
    type EditModel,
    FeatureFlag,
    displayPathWithoutWorkspaceFolderPrefix,
    featureFlagProvider,
    isDotComAuthed,
    storeLastValue,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import type * as vscode from 'vscode'
import { gitMetadataForCurrentEditor } from '../repository/git-metadata-for-editor'
import { GitHubDotComRepoMetadata } from '../repository/githubRepoMetadata'
import { splitSafeMetadata } from '../services/telemetry-v2'
import type { SmartSelectionType } from './prompt/smart-apply'

const MAX_LOGGING_PAYLOAD_SIZE_BYTES = 1024 * 1024 // 1 MB

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
    applyTaskId?: string
}

interface EditLoggingContext {
    userQuery: string
    filePath: string
    fileContent: string
    selectionRange: [number, number]
}

export type SmartApplyLoggingState =
    | SmartApplyBaseContext
    | SmartApplySelectionContext
    | SmartApplyFinalContext

export class EditLoggingFeatureFlagManager implements vscode.Disposable {
    private featureFlagSmartApplyContextDataCollection = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.SmartApplyContextDataCollectionFlag)
    )

    private featureFlagEditContextDataCollection = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.EditContextDataCollectionFlag)
    )

    public isSmartApplyContextDataCollectionFlagEnabled(): boolean {
        return !!this.featureFlagSmartApplyContextDataCollection.value.last
    }

    public isEditContextDataCollectionFlagEnabled(): boolean {
        return !!this.featureFlagEditContextDataCollection.value.last
    }

    public dispose(): void {
        this.featureFlagSmartApplyContextDataCollection.subscription.unsubscribe()
        this.featureFlagEditContextDataCollection.subscription.unsubscribe()
    }
}

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
    private loggingFeatureFlagManagerInstance: EditLoggingFeatureFlagManager

    constructor(loggingFeatureFlagManagerInstance: EditLoggingFeatureFlagManager) {
        this.loggingFeatureFlagManagerInstance = loggingFeatureFlagManagerInstance
    }

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

    public addApplyContext(
        requestId: SmartApplyLoggingRequestId,
        applyTimeMs: number,
        applyTaskId: string | undefined
    ): void {
        const request = this.getRequest(requestId)
        if (!request) {
            return
        }
        this.activeRequests.set(requestId, {
            ...request,
            applyTimeMs,
            applyTaskId,
        })
    }

    public logSmartApplyContextToTelemetry(requestId: SmartApplyLoggingRequestId): void {
        const context = this.getSmartApplyLoggingContext(requestId)
        if (!context) {
            return
        }
        const { metadata, privateMetadata } = splitSafeMetadata(context)
        telemetryRecorder.recordEvent('cody.smart-apply.context', 'applied', {
            metadata: {
                ...metadata,
                recordsPrivateMetadataTranscript: 1,
            },
            privateMetadata: {
                smartApplyContext: privateMetadata,
            },
            billingMetadata: { product: 'cody', category: 'billable' },
        })
    }

    private getSmartApplyLoggingContext(
        requestId: SmartApplyLoggingRequestId
    ): SmartApplyFinalContext | undefined {
        const request = this.activeRequests.get(requestId)
        if (!request) {
            return undefined
        }
        if (
            !shouldLogEditContextItem(
                request,
                this.loggingFeatureFlagManagerInstance.isSmartApplyContextDataCollectionFlagEnabled()
            )
        ) {
            return undefined
        }
        // Verify that the request has the final property required.
        if (typeof (request as SmartApplyFinalContext).applyTimeMs !== 'number') {
            return undefined
        }
        return request as SmartApplyFinalContext
    }

    private getRequest(requestId: SmartApplyLoggingRequestId): SmartApplyLoggingState | undefined {
        return this.activeRequests.get(requestId)
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
}

export function getEditLoggingContext(param: {
    isFeatureFlagEnabledForLogging: boolean
    instruction: string
    document: vscode.TextDocument
    selectionRange: vscode.Range
}): EditLoggingContext | undefined {
    const context: EditLoggingContext = {
        userQuery: param.instruction,
        filePath: displayPathWithoutWorkspaceFolderPrefix(param.document.uri),
        fileContent: param.document.getText(),
        selectionRange: [
            param.document.offsetAt(param.selectionRange.start),
            param.document.offsetAt(param.selectionRange.end),
        ],
    }
    if (!shouldLogEditContextItem(context, param.isFeatureFlagEnabledForLogging)) {
        return undefined
    }
    return context
}

export function shouldLogEditContextItem<T>(
    payload: T,
    isFeatureFlagEnabledForLogging: boolean
): boolean {
    // 🚨 SECURITY: included only for DotCom users and for users in the feature flag.
    if (isDotComAuthed() && isFeatureFlagEnabledForLogging) {
        const payloadSize = calculatePayloadSizeInBytes(payload)
        return payloadSize !== undefined && payloadSize < MAX_LOGGING_PAYLOAD_SIZE_BYTES
    }
    return false
}

export function calculatePayloadSizeInBytes<T>(payload: T): number | undefined {
    try {
        const snippetSizeBytes = Buffer.byteLength(JSON.stringify(payload) || '', 'utf8')
        return snippetSizeBytes
    } catch (error) {
        return undefined
    }
}
