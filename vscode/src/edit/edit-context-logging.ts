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
import type * as vscode from 'vscode'
import { gitMetadataForCurrentEditor } from '../repository/git-metadata-for-editor'
import { GitHubDotComRepoMetadata } from '../repository/githubRepoMetadata'
import { splitSafeMetadata } from '../services/telemetry-v2'
import type { SmartApplySelectionType } from './prompt/smart-apply'

const MAX_LOGGING_PAYLOAD_SIZE_BYTES = 1024 * 1024 // 1 MB

type ContextId = string

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
    selectionType: SmartApplySelectionType
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

type SmartApplyLoggingState = SmartApplyBaseContext | SmartApplySelectionContext | SmartApplyFinalContext

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
     * Stores the SmartApplyContext for each task ID.
     */
    private activeContexts = new LRUCache<ContextId, SmartApplyLoggingState>({
        max: 20,
    })
    private repoMetaDataInstance = GitHubDotComRepoMetadata.getInstance()
    private loggingFeatureFlagManagerInstance: EditLoggingFeatureFlagManager

    constructor(loggingFeatureFlagManagerInstance: EditLoggingFeatureFlagManager) {
        this.loggingFeatureFlagManagerInstance = loggingFeatureFlagManagerInstance
    }

    /**
     * Records the base context for a smart apply operation.
     * Returns the task ID for future context updates.
     */
    public recordSmartApplyBaseContext({
        taskId,
        model,
        userQuery,
        replacementCodeBlock,
        document,
        selectionType,
        selectionRange,
        selectionTimeMs,
    }: {
        taskId: string
        model: EditModel
        userQuery: string
        replacementCodeBlock: string
        document: vscode.TextDocument
        selectionType: SmartApplySelectionType
        selectionRange: vscode.Range
        selectionTimeMs: number
    }): void {
        const baseRepoContext = this.getBaseRepoContext()
        const filePath = displayPathWithoutWorkspaceFolderPrefix(document.uri)
        const fileContent = document.getText()

        const context: SmartApplySelectionContext = {
            smartApplyModel: model,
            ...baseRepoContext,
            userQuery,
            replacementCodeBlock,
            filePath,
            fileContent,
            selectionType,
            selectionRange: [
                document.offsetAt(selectionRange.start),
                document.offsetAt(selectionRange.end),
            ],
            selectionTimeMs,
        }

        this.activeContexts.set(taskId, context)
    }

    public addApplyContext({
        taskId,
        applyTimeMs,
    }: {
        taskId: string
        applyTimeMs: number
    }): void {
        const context = this.getContext(taskId)
        if (!context) {
            return
        }
        this.activeContexts.set(taskId, {
            ...context,
            applyTimeMs,
            applyTaskId: taskId,
        })
    }

    public logSmartApplyContextToTelemetry(taskId: string): void {
        const context = this.getSmartApplyLoggingContext(taskId)
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

    private getSmartApplyLoggingContext(taskId: string): SmartApplyFinalContext | undefined {
        const context = this.activeContexts.get(taskId)
        if (!context) {
            return undefined
        }
        if (
            !shouldLogEditContextItem(
                context,
                this.loggingFeatureFlagManagerInstance.isSmartApplyContextDataCollectionFlagEnabled()
            )
        ) {
            return undefined
        }
        // Verify that the context has the final property required.
        if (typeof (context as SmartApplyFinalContext).applyTimeMs !== 'number') {
            return undefined
        }
        return context as SmartApplyFinalContext
    }

    private getContext(taskId: string): SmartApplyLoggingState | undefined {
        return this.activeContexts.get(taskId)
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

function shouldLogEditContextItem<T>(payload: T, isFeatureFlagEnabledForLogging: boolean): boolean {
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
