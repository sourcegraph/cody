import {
    type AgentToolboxSettings,
    FeatureFlag,
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
        // Using private constructor for Singleton pattern
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
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCody),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.ContextAgentDefaultChatModel),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyShellContext),
        userProductSubscription.pipe(distinctUntilChanged()),
        modelsService.modelsChanges.pipe(
            map(models => (models === pendingOperation ? null : models)),
            distinctUntilChanged()
        ),
        this.changeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([auth, deepCodyEnabled, useDefaultChatModel, instanceShellContextFlag, sub, models]) => {
            // Return null if:
            // - Subscription is pending
            // - Users can upgrade (free user)
            // - Enterprise without deep-cody feature flag
            if (
                sub === pendingOperation ||
                sub?.userCanUpgrade ||
                !models ||
                (!isDotCom(auth.endpoint) && !deepCodyEnabled)
            ) {
                this.isEnabled = false
                return null
            }

            // TODO (bee): Remove once A/B test is over - 3.5 Haiku vs default chat model.
            const haikuModel = models.primaryModels.find(model => model.id.includes('5-haiku'))
            DeepCodyAgent.model = useDefaultChatModel ? models.preferences.defaults.chat : haikuModel?.id
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
