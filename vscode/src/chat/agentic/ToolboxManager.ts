import {
    type AgentToolboxSettings,
    FeatureFlag,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    logDebug,
    modelsService,
    pendingOperation,
    startWith,
    userProductSubscription,
} from '@sourcegraph/cody-shared'
import { type Observable, Subject, map } from 'observable-fns'
import { env } from 'vscode'
import { localStorage } from '../../services/LocalStorageProvider'
import { DeepCodyAgent } from './DeepCody'

// Using a readonly interface improves performance by preventing mutations
const DEFAULT_SHELL_CONFIG = Object.freeze({
    user: false,
    instance: false,
    client: Boolean(env.shell),
})

type StoredToolboxSettings = {
    readonly agent: string | undefined
    readonly shell: boolean
}

export class ToolboxManager {
    private static readonly STORAGE_KEY = 'CODY_CHATAGENTS_TOOLBOX_SETTINGS'
    private static instance?: ToolboxManager

    private constructor() {
        // Using private constructor for singleton pattern
    }

    private isEnabled = false
    private readonly changeNotifications = new Subject<void>()
    private shellConfig = { ...DEFAULT_SHELL_CONFIG }

    public static getInstance(): ToolboxManager {
        // Singleton pattern with lazy initialization
        return ToolboxManager.instance ? ToolboxManager.instance : new ToolboxManager()
    }

    private getStoredUserSettings(): StoredToolboxSettings {
        return (
            localStorage.get<StoredToolboxSettings>(ToolboxManager.STORAGE_KEY) ?? {
                agent: undefined,
                shell: this.shellConfig.user,
            }
        )
    }

    public getSettings(): AgentToolboxSettings | null {
        if (!this.isEnabled) {
            return null
        }
        const { agent, shell } = this.getStoredUserSettings()
        return {
            agent,
            // Only show shell option if it's supported by instance and client.
            shell: this.shellConfig.instance && this.shellConfig.client ? shell : undefined,
        }
    }

    public async updatetoolboxSettings(settings: AgentToolboxSettings): Promise<void> {
        logDebug('ToolboxManager', 'Updating toolbox settings', { verbose: settings })
        await localStorage.set(ToolboxManager.STORAGE_KEY, settings)
        this.changeNotifications.next()
    }

    public readonly settings: Observable<AgentToolboxSettings | null> = combineLatest(
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
        map(([deepCodyEnabled, useDefaultChatModel, instanceShellContextFlag, sub, models]) => {
            // Return null if subscription is pending or user can upgrade (free user)
            if (sub === pendingOperation || sub?.userCanUpgrade || !models || !deepCodyEnabled) {
                this.isEnabled = false
                return null
            }

            // TODO (bee): Remove once A/B test is over - 3.5 Haiku vs default chat model.
            const haikuModel = models.primaryModels.find(model => model.id.includes('5-haiku'))
            DeepCodyAgent.model = useDefaultChatModel ? models.preferences.defaults.chat : haikuModel?.id
            this.isEnabled = Boolean(DeepCodyAgent.model)

            Object.assign(this.shellConfig, { instance: instanceShellContextFlag })

            return this.getSettings()
        })
    )

    public get changes(): Observable<void> {
        return this.changeNotifications
    }
}

export const toolboxSettings = ToolboxManager.getInstance()
