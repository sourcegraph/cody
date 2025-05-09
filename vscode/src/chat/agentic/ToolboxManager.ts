import {
    type AgentToolboxSettings,
    FeatureFlag,
    type Model,
    ModelTag,
    authStatus,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    isDotCom,
    modelsService,
    pendingOperation,
    startWith,
    userProductSubscription,
} from '@sourcegraph/cody-shared'
import { DeepCodyAgentID } from '@sourcegraph/cody-shared/src/models/client'
import { type Observable, Subject, map } from 'observable-fns'
import { env } from 'vscode'
import { isCodyTesting } from '../chat-view/chat-helpers'
import { DeepCodyAgent } from './DeepCody'

// Using a readonly interface improves performance by preventing mutations
const DEFAULT_SHELL_CONFIG = Object.freeze({
    user: false,
    instance: false,
    client: false,
})

/**
 * ToolboxManager manages the toolbox settings for the Cody chat agents.
 * NOTE: This is a Singleton class.
 * TODO: Clean up this class and remove unused code.
 */
class ToolboxManager {
    private static instance?: ToolboxManager

    private constructor() {
        this.isEnabled = false
    }

    private isEnabled = false
    private isRateLimited = false
    private readonly changeNotifications = new Subject<void>()
    private shellConfig = { ...DEFAULT_SHELL_CONFIG }

    public static getInstance(): ToolboxManager {
        // Singleton pattern with lazy initialization
        return ToolboxManager.instance ? ToolboxManager.instance : new ToolboxManager()
    }

    public getSettings(): AgentToolboxSettings | null {
        if (!this.isEnabled) {
            return null
        }
        const shellError = this.getFeatureError('shell')
        // TODO: Remove hard-coded agent once we have a proper agentic chat selection UI
        return {
            agent: { name: this.isRateLimited ? undefined : DeepCodyAgentID },
            shell: {
                enabled: shellError === undefined,
                error: shellError,
            },
        }
    }

    public isAgenticChatEnabled(): boolean {
        return this.isEnabled && Boolean(DeepCodyAgent.model) && !isCodyTesting
    }

    public setIsRateLimited(hasHitLimit: boolean): void {
        if (this.isEnabled && this.isRateLimited !== hasHitLimit) {
            this.isRateLimited = hasHitLimit
            this.changeNotifications.next()
        }
    }

    /**
     * Returns a real-time Observable stream of toolbox settings that updates when any of the following changes:
     * - Feature flags
     * - User subscription
     * - Available models
     * - Manual settings updates
     * Use this when you need to react to settings changes over time.
     */
    public readonly observable: Observable<AgentToolboxSettings | null> = combineLatest(
        authStatus,
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.AgenticContextDisabled),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.ContextAgentDefaultChatModel),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyShellContext),
        userProductSubscription.pipe(distinctUntilChanged()),
        modelsService.modelsChanges.pipe(
            map(models => (models === pendingOperation ? null : models)),
            distinctUntilChanged()
        ),
        this.changeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([auth, isDisabled, useDefaultChatModel, instanceShellContextFlag, sub, models]) => {
            // Return null if:
            // - Subscription is pending
            // - Users can upgrade (free user)
            // - Feature flag to disabled is on.
            if (
                sub === pendingOperation ||
                (isDotCom(auth.endpoint) && sub?.userCanUpgrade) ||
                !models ||
                isCodyTesting ||
                isDisabled
            ) {
                DeepCodyAgent.model = undefined
                this.isEnabled = false
                return null
            }

            // If the feature flag to use the default chat model is enabled, use the default chat model.
            // Otherwise, use gemini-flash or haiku 3.5 model if available.
            // If neither is available, use the first model with speed tag in the list.
            const defaultChatModel = models.preferences?.defaults?.chat
            if (useDefaultChatModel && defaultChatModel) {
                DeepCodyAgent.model = defaultChatModel
            } else {
                DeepCodyAgent.model = getDeepCodyModel(models.primaryModels)?.id
            }

            this.isEnabled = Boolean(DeepCodyAgent.model)

            Object.assign(this.shellConfig, {
                instance: instanceShellContextFlag,
                client: Boolean(env.shell),
            })

            return this.getSettings()
        })
    )

    private getFeatureError(feature: string): string | undefined {
        switch (feature) {
            case 'shell':
                if (!this.shellConfig.instance) {
                    return 'Not supported by the instance.'
                }
                if (!this.shellConfig.client) {
                    return 'Not supported by the client.'
                }
                break
        }
        return undefined
    }
}

export const toolboxManager = ToolboxManager.getInstance()

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
