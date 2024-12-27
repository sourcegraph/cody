import type { Span } from '@opentelemetry/api'
import {
    type ChatMessage,
    type ContextItem,
    type TokenCounterUtils,
    currentAuthStatusAuthed,
    firstResultFromOperation,
    getTokenCounterUtils,
    logError,
    telemetryEvents,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import type { SharedProperties } from '@sourcegraph/cody-shared/src/telemetry-v2/events/chat-question'
import { publicRepoMetadataIfAllWorkspaceReposArePublic } from '../../../repository/githubRepoMetadata'

interface IntentInfo {
    userSpecifiedIntent: ChatMessage['intent'] | 'auto'
    detectedIntent: ChatMessage['intent']
    detectedIntentScores:
        | {
              intent: string
              score: number
          }[]
        | null
        | undefined
}

/**
 * Utility class for encapsulating omnibox telemetry events
 */
export class OmniboxTelemetry {
    private intentInfo?: IntentInfo
    constructor(
        private baseProperties: SharedProperties,
        private tokenCounterUtils: TokenCounterUtils
    ) {}

    public static async create(
        baseProperties: Omit<SharedProperties, 'repoMetadata' | 'repoIsPublic' | 'authStatus'>
    ): Promise<OmniboxTelemetry> {
        const tokenCounterUtils = wrapInActiveSpan('chat.getTokenCounterUtils', () =>
            getTokenCounterUtils()
        )
        const { isPublic: repoIsPublic, repoMetadata } = await wrapInActiveSpan(
            'chat.getRepoMetadata',
            () => firstResultFromOperation(publicRepoMetadataIfAllWorkspaceReposArePublic)
        )

        return new OmniboxTelemetry(
            {
                ...baseProperties,
                authStatus: currentAuthStatusAuthed(),
                repoIsPublic,
                repoMetadata,
            },
            await tokenCounterUtils
        )
    }

    public recordChatQuestionSubmitted(mentions: ContextItem[]) {
        telemetryEvents['cody.chat-question/submitted'].record(
            { ...this.baseProperties, mentions },
            this.tokenCounterUtils
        )
    }

    public setIntentInfo(intentInfo: IntentInfo) {
        this.intentInfo = intentInfo
    }

    public recordChatQuestionExecuted(
        context: ContextItem[] | { used: ContextItem[]; ignored: ContextItem[] },
        spans: {
            current: Span
            addMetadata: boolean
        }
    ) {
        if (!this.intentInfo) {
            logError(
                'AgentTelemetry',
                'failed to log cody.chat-question/executed beacuse intent info was not set'
            )
            return
        }
        telemetryEvents['cody.chat-question/executed'].record(
            {
                ...this.baseProperties,
                ...this.intentInfo,
                context,
            },
            spans,
            this.tokenCounterUtils
        )
    }
}
