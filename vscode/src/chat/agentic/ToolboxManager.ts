import {
    type AgentToolboxSettings,
    FeatureFlag,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    logDebug,
    pendingOperation,
    startWith,
    storeLastValue,
    userProductSubscription,
} from '@sourcegraph/cody-shared'
import { type Observable, Subject, map } from 'observable-fns'
import { env } from 'vscode'
import { localStorage } from '../../services/LocalStorageProvider'

interface ShellConfiguration {
    user: boolean
    instance: boolean
    client: boolean
}

export class ToolboxManager {
    public static STORAGE_KEY = 'CODY_CHATAGENTS_TOOLBOX_SETTINGS'
    private static instance: ToolboxManager

    public static getInstance(): ToolboxManager {
        return ToolboxManager.instance ? ToolboxManager.instance : new ToolboxManager()
    }

    private changeNotifications = new Subject<void>()

    /**
     * Terminal/Shell context is only available if instance has the Feature Flag enabled.
     */
    private readonly shellConfig: ShellConfiguration = {
        user: false,
        instance: false,
        client: Boolean(env.shell) ?? false,
    }

    /**
     * Check if instance has the Feature Flag enabled.
     */
    private readonly featureDeepCodyShellContext = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCodyShellContext)
    )

    private get isTerminalContextEnabled(): boolean | undefined {
        const isEnabledByInstance = this.featureDeepCodyShellContext.value?.last
        const isEnabledByClient = this.shellConfig.client
        const isEnabledByUser = this.shellConfig.user

        this.shellConfig.instance = isEnabledByInstance ?? this.shellConfig.instance

        return Boolean(isEnabledByInstance && isEnabledByClient && isEnabledByUser)
    }

    private getStoredSettings(): { agent: boolean; shell: boolean } {
        return (
            localStorage.get(ToolboxManager.STORAGE_KEY) ?? {
                agent: false,
                shell: this.shellConfig.user,
            }
        )
    }

    // Separate method to just get settings without side effects
    public getSettings(): AgentToolboxSettings {
        const storedSettings = this.getStoredSettings()
        this.updateUserTerminalSetting(storedSettings.shell)
        return {
            ...storedSettings,
            shell: this.isTerminalContextEnabled,
        }
    }

    public settings: Observable<AgentToolboxSettings | null> = combineLatest(
        userProductSubscription.pipe(
            map(subscription => subscription),
            distinctUntilChanged()
        ),
        this.changeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([subscription]) => {
            // Return null if subscription is pending or user can upgrade (free user)
            if (subscription === pendingOperation || subscription?.userCanUpgrade) {
                return null
            }
            return this.getSettings()
        })
    )

    public async updatetoolboxSettings(settings: AgentToolboxSettings): Promise<void> {
        logDebug('ToolboxManager', 'Updating toolbox settings', { verbose: settings })
        await localStorage.set(ToolboxManager.STORAGE_KEY, settings)
        this.changeNotifications.next()
    }

    // Updates the user shell config and triggers a change notification
    public updateUserTerminalSetting(newValue = false): void {
        const current = this.shellConfig.user
        if (current !== newValue) {
            this.shellConfig.user = newValue
            this.changeNotifications.next()
        }
    }

    public get changes(): Observable<void> {
        return this.changeNotifications
    }
}

export const toolboxSettings = ToolboxManager.getInstance()
