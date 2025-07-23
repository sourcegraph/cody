import {
    type AgentToolboxSettings,
    type ContextItem,
    FeatureFlag,
    type Model,
    ModelTag,
    type ProcessingStep,
    type SerializedPromptEditorState,
    authStatus,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    modelsService,
    pendingOperation,
    resolvedConfig,
    startWith,
} from '@sourcegraph/cody-shared'
import { DeepCodyAgentID } from '@sourcegraph/cody-shared/src/models/client'
import { type Observable, Subject, map } from 'observable-fns'
import * as vscode from 'vscode'
import { DeepCodyAgent } from '../../agentic/DeepCody'
import type { ChatBuilder } from '../ChatBuilder'
import { isCodyTesting } from '../chat-helpers'
import type { HumanInput } from '../context'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate } from './interfaces'

// Using a readonly interface improves performance by preventing mutations
const DEFAULT_SHELL_CONFIG = Object.freeze({
    user: false,
    instance: false,
    client: false,
})

// NOTE: Skip query rewrite for Deep Cody as it will be done during review step.
const skipQueryRewriteForDeepCody = true

// Using a readonly interface improves performance by preventing mutations

export class DeepCodyHandler extends ChatHandler implements AgentHandler {
    public static model: string | undefined = undefined

    private static isToolboxEnabled = false
    private static readonly changeNotifications = new Subject<void>()
    private static shellConfig = { ...DEFAULT_SHELL_CONFIG }

    override async computeContext(
        requestID: string,
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        chatBuilder: ChatBuilder,
        delegate: AgentHandlerDelegate,
        signal: AbortSignal
    ): Promise<{
        contextItems?: ContextItem[]
        error?: Error
        abort?: boolean
    }> {
        const baseContextResult = await super.computeContext(
            requestID,
            { text, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal,
            skipQueryRewriteForDeepCody
        )
        // Early return if basic conditions aren't met.
        if (baseContextResult.error || baseContextResult.abort) {
            return baseContextResult
        }

        const baseContext = baseContextResult.contextItems ?? []
        const agent = new DeepCodyAgent(
            chatBuilder,
            this.chatClient,
            (steps: ProcessingStep[]) => delegate.postStatuses(steps),
            (step: ProcessingStep) => delegate.postRequest(step)
        )

        return { contextItems: await agent.getContext(requestID, signal, baseContext) }
    }

    // ========================================================================
    // Toolbox Management Methods (formerly ToolboxManager functionality)
    // ========================================================================

    public static getSettings(): AgentToolboxSettings | null {
        if (!DeepCodyHandler.isToolboxEnabled) {
            return null
        }
        const shellError = DeepCodyHandler.getFeatureError('shell')
        return {
            // @Deprecated Keeping this for backward compatibility to avoid breaking
            // telemetry and existing code.
            agent: { name: DeepCodyHandler.isToolboxEnabled ? DeepCodyAgentID : undefined },
            shell: {
                enabled: shellError === undefined,
                error: shellError,
            },
        }
    }

    public static isAgenticChatEnabled(): boolean {
        return DeepCodyHandler.isToolboxEnabled && Boolean(DeepCodyHandler.model) && !isCodyTesting
    }

    /**
     * Returns a real-time Observable stream of toolbox settings that updates when any of the following changes:
     * - Feature flags
     * - User subscription
     * - Available models
     * - Manual settings updates
     * Use this when you need to react to settings changes over time.
     */
    public static readonly observable: Observable<AgentToolboxSettings | null> = combineLatest(
        authStatus,
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.AgenticContextDisabled),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.ContextAgentDefaultChatModel),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyShellContext),
        modelsService.modelsChanges.pipe(
            map(models => (models === pendingOperation ? null : models)),
            distinctUntilChanged()
        ),
        resolvedConfig,
        DeepCodyHandler.changeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(
            ([
                auth,
                isDisabledOnInstance,
                useDefaultChatModel,
                instanceShellContextFlag,
                models,
                config,
            ]) => {
                // Return null if:
                // - Subscription is pending
                // - Feature flag to disabled is on.
                if (
                    !models ||
                    isCodyTesting ||
                    isDisabledOnInstance ||
                    config.configuration?.chatAgenticContext === false
                ) {
                    DeepCodyHandler.model = undefined
                    DeepCodyHandler.isToolboxEnabled = false
                    return null
                }

                // If the feature flag to use the default chat model is enabled, use the default chat model.
                // Otherwise, use gemini-flash or haiku 3.5 model if available.
                // If neither is available, use the first model with speed tag in the list.
                const defaultChatModel = models.preferences?.defaults?.chat
                if (useDefaultChatModel && defaultChatModel) {
                    DeepCodyHandler.model = defaultChatModel
                } else {
                    DeepCodyHandler.model = getDeepCodyModel(models.primaryModels)?.id
                }
                DeepCodyHandler.isToolboxEnabled = Boolean(DeepCodyHandler.model)

                Object.assign(DeepCodyHandler.shellConfig, {
                    instance: instanceShellContextFlag,
                    client: Boolean(vscode.env.shell),
                })

                return DeepCodyHandler.getSettings()
            }
        )
    )

    private static getFeatureError(feature: string): string | undefined {
        switch (feature) {
            case 'shell':
                if (!DeepCodyHandler.shellConfig.instance) {
                    return 'Shell commands are not supported by the instance.'
                }
                if (!DeepCodyHandler.shellConfig.client) {
                    return 'Shell commands are not supported by the client.'
                }
                break
        }
        return undefined
    }
}

/**
 * Returns the most suitable model for Deep Cody / agentic chat.
 * The model is expected to be fast and capable of reviewing and filtering large
 * amounts of context and ability to use tools.
 *
 * Prioritizes models in the following order:
 * 1. Gemini Flash model
 * 2. GPT-4.1 Mini model
 * 3. Haiku 3.5 model
 * 4. First model with the Speed tag
 *
 * @param models - Array of available models
 * @returns The ID of the selected model, or undefined if no suitable model is found
 */
export function getDeepCodyModel(models: Model[]): Model | undefined {
    if (!models.length) return undefined
    // List of preferred model id substring sorted by priority.
    const priorityModels = ['-flash', 'gpt-4.1-mini', '5-haiku']
    // Find the model that matches the preferred model id substring.
    // If none of the preferred models are found, find the first model with the Speed tag.
    const matches = priorityModels.map(s => models.find(m => m.id.includes(s)))
    return matches.find(m => m !== undefined) || models.find(m => m.tags.includes(ModelTag.Speed))
}
