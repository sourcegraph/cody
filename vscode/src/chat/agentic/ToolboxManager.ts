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
    storeLastValue,
    userProductSubscription,
} from '@sourcegraph/cody-shared'
import { type Observable, Subject, map } from 'observable-fns'
import { env } from 'vscode'
import { localStorage } from '../../services/LocalStorageProvider'

// Using a readonly interface improves performance by preventing mutations
interface ReadonlyShellConfig {
    readonly user: boolean
    instance: boolean
    readonly client: boolean
}

interface StoredToolboxSettings {
    agent: string | undefined
    shell: boolean
}

export class ToolboxManager {
    private static readonly STORAGE_KEY = 'CODY_CHATAGENTS_TOOLBOX_SETTINGS'
    private static instance?: ToolboxManager

    private isEnabled = false

    // Singleton pattern with lazy initialization
    public static getInstance(): ToolboxManager {
        return ToolboxManager.instance ? ToolboxManager.instance : new ToolboxManager()
    }

    private readonly changeNotifications = new Subject<void>()

    // Initialize shell config with immutable defaults
    private readonly shellConfig: ReadonlyShellConfig = {
        user: false,
        instance: false,
        client: Boolean(env.shell),
    }

    /**
     * Check if instance has the Feature Flag enabled.
     */
    private readonly featureDeepCodyShellContext = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyShellContext)
    )

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
        const stored = this.getStoredUserSettings()
        return {
            agent: stored.agent,
            shell: Boolean(
                this.featureDeepCodyShellContext.value?.last && this.shellConfig.client && stored.shell
            ),
        }
    }

    public async updatetoolboxSettings(settings: AgentToolboxSettings): Promise<void> {
        logDebug('ToolboxManager', 'Updating toolbox settings', { verbose: settings })
        await localStorage.set(ToolboxManager.STORAGE_KEY, settings)
        this.changeNotifications.next()
    }

    public settings: Observable<AgentToolboxSettings | null> = combineLatest(
        userProductSubscription.pipe(distinctUntilChanged()),
        modelsService.modelsChanges.pipe(
            map(models => (models === pendingOperation ? null : models)),
            distinctUntilChanged()
        ),
        this.changeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([subscription, models]) => {
            // Return null if subscription is pending or user can upgrade (free user)
            if (subscription === pendingOperation || subscription?.userCanUpgrade || !models) {
                this.isEnabled = false
                return null
            }
            this.isEnabled = models.primaryModels.some(model => model.id.includes('3-5-haiku'))
            return this.getSettings()
        })
    )

    public get changes(): Observable<void> {
        return this.changeNotifications
    }
}

export const toolboxSettings = ToolboxManager.getInstance()
