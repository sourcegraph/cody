import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ClientConfiguration,
    CodyIDE,
    InvisibleStatusBarTag,
    type IsIgnored,
    Mutable,
    type ResolvedConfiguration,
    assertUnreachable,
    authStatus,
    combineLatest,
    contextFiltersProvider,
    distinctUntilChanged,
    firstValueFrom,
    fromVSCodeEvent,
    logError,
    promise,
    resolvedConfig,
    shareReplay,
} from '@sourcegraph/cody-shared'

import { type Subscription, map } from 'observable-fns'
import type { LiteralUnion, ReadonlyDeep } from 'type-fest'
import { getGhostHintEnablement } from '../commands/GhostHintDecorator'
import { getReleaseNotesURLByIDE } from '../release'
import { version } from '../version'
import { FeedbackOptionItems, SupportOptionItems } from './FeedbackOptions'
import { enableVerboseDebugMode } from './utils/export-logs'

let singleton: CodyStatusBar | undefined = undefined

const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check) '
const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0 '

const ONE_HOUR = 60 * 60 * 1000

const STATUS_BAR_INTERACTION_COMMAND = 'cody.status-bar.interacted'

interface StatusBarState {
    text: string
    icon: 'normal' | 'loading' | 'disabled'
    tooltip: string
    style: 'normal' | 'warning' | 'error' | 'disabled'
    tags: Set<InvisibleStatusBarTag>

    interact: (abortSignal: AbortSignal) => Promise<void> | void
}
export class CodyStatusBar {
    private errors = new Mutable<Set<StatusBarError>>(new Set())
    private loaders = new Mutable<Set<StatusBarLoader>>(new Set())
    private renderSubscription: Subscription<any>
    private currentInteraction: AbortController | undefined

    private statusBarItem = vscode.window.createStatusBarItem(
        'extension-status',
        vscode.StatusBarAlignment.Right
    )
    private command = vscode.commands.registerCommand(
        STATUS_BAR_INTERACTION_COMMAND,
        this.handleInteraction.bind(this)
    )

    private ignoreStatus = combineLatest(
        fromVSCodeEvent(
            vscode.window.onDidChangeActiveTextEditor,
            () => vscode.window.activeTextEditor
        ).pipe(distinctUntilChanged()),
        // TODO: technically this shouldn't be needed but the contextFilterProvider doesn't update on auth changes yet
        authStatus,
        contextFiltersProvider.changes
    ).pipe(
        map(async ([editor]) => {
            const uri = editor?.document.uri
            const isIgnored = uri ? await contextFiltersProvider.isUriIgnored(uri) : false
            return isIgnored
        })
    )
    private state = combineLatest(
        authStatus,
        resolvedConfig,
        this.errors.changes,
        this.loaders.changes,
        this.ignoreStatus
    ).pipe(
        map((combined): StatusBarState | undefined => {
            return {
                icon: 'normal',
                text: '',
                style: 'normal',
                tags: new Set(),
                ...this.buildState(...combined),
            }
        }),
        shareReplay()
    )

    private constructor() {
        let lastState: StatusBarState | undefined
        this.statusBarItem.command = STATUS_BAR_INTERACTION_COMMAND
        this.renderSubscription = this.state.subscribe(newState => {
            this.render(newState, lastState)
        })
    }

    static init(disposables: vscode.Disposable[]): CodyStatusBar {
        if (singleton) {
            throw new Error('CodyStatusBar already initialized')
        }
        singleton = new CodyStatusBar()
        // by returning a separate disposable we ensure that only the component
        // that initialized it can dispose of it.
        const disposable = vscode.Disposable.from({ dispose: singleton.dispose.bind(singleton) })
        disposables.push(disposable)
        return singleton
    }

    addError(args: StatusBarErrorArgs) {
        const now = Date.now()
        const ttl = args.timeout !== undefined ? Math.min(ONE_HOUR, args.timeout - now) : ONE_HOUR

        const errorHandle = {}
        const remove = () => {
            this.errors.mutate(draft => {
                // this is safe because we'll asign properties to the same
                // object, maintaining object identity
                draft.delete(errorHandle as any)
                return draft
            })
        }
        const scheduledRemoval = setTimeout(remove, ttl)
        const removeFn = () => {
            clearTimeout(scheduledRemoval)
            remove()
        }
        // we assign so we maintain object identity
        const errorObject = Object.assign(errorHandle, {
            createdAt: now,
            title: args.title,
            description: args.description,
            errorType: args.errorType,
            onShow: args.onShow,
            onSelect: async () => {
                if (args.removeAfterSelected) {
                    removeFn()
                }
                await args.onSelect?.()
            },
        })

        this.errors.mutate(draft => {
            draft.add(errorObject)
            return draft
        })
        return removeFn
    }

    addLoader<T>(args: StatusBarLoaderArgs) {
        const now = Date.now()
        const ttl = args.timeout !== undefined ? Math.min(ONE_HOUR, args.timeout - now) : ONE_HOUR
        const loaderHandle = {}
        const remove = () => {
            this.loaders.mutate(draft => {
                // this is safe because we'll asign properties to the same
                // object, maintaining object identity
                draft.delete(loaderHandle as any)
                return draft
            })
        }
        const scheduledRemoval = setTimeout(remove, ttl)
        const removeFn = () => {
            clearTimeout(scheduledRemoval)
            remove()
        }
        const loaderObject = Object.assign(loaderHandle, {
            createdAt: now,
            title: args.title,
            kind: args.kind || 'feature',
        })
        this.loaders.mutate(draft => {
            draft.add(loaderObject)
            return draft
        })
        return removeFn
    }

    hasError(
        filterFn?: (
            v: Pick<StatusBarError, 'createdAt' | 'description' | 'errorType' | 'title'>
        ) => boolean
    ): boolean {
        if (!filterFn) {
            return this.errors.current.size > 0
        }

        for (const v of this.errors.current.values()) {
            if (filterFn(v)) {
                return true
            }
        }
        return false
    }

    private async handleInteraction() {
        this.currentInteraction?.abort()
        const interaction = new AbortController()
        this.currentInteraction = interaction
        const currentState = await firstValueFrom(this.state)
        await currentState?.interact(this.currentInteraction.signal)
    }

    private render(newState: StatusBarState | undefined, lastState: StatusBarState | undefined) {
        if (!lastState !== !newState) {
            newState !== undefined ? this.statusBarItem.show() : this.statusBarItem.hide()
        }
        if (!newState) {
            return
        }
        const icon =
            newState.icon === 'disabled'
                ? '$(cody-logo-heavy-slash)'
                : newState.icon === 'loading'
                  ? '$(loading~spin)'
                  : '$(cody-logo-heavy)'
        this.statusBarItem.text = `${icon} ${newState.text}`
        // we insert tags in the tooltip as it's not escaped by vscode
        const hiddenTags = [...newState.tags.values()].join('')
        this.statusBarItem.tooltip = `${hiddenTags}${newState.tooltip}`
        switch (newState.style) {
            case 'normal':
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.activeBackground'
                )
                this.statusBarItem.color = new vscode.ThemeColor('statusBar.foreground')
                break
            case 'disabled':
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.offlineBackground'
                )
                this.statusBarItem.color = new vscode.ThemeColor('statusBar.offlineForeground')
                break
            case 'warning':
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.warningBackground'
                )
                this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground')
                break
            case 'error':
                this.statusBarItem.backgroundColor = new vscode.ThemeColor(
                    'statusBarItem.errorBackground'
                )
                this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground')
                break
            default:
                assertUnreachable(newState.style)
        }
    }

    private buildState(
        authStatus: AuthStatus,
        config: ResolvedConfiguration,
        errors: ReadonlySet<StatusBarError>,
        loaders: ReadonlySet<StatusBarLoader>,
        ignoreStatus: IsIgnored
    ): Partial<StatusBarState> & Pick<StatusBarState, 'interact' | 'tooltip'> {
        const tags = new Set<InvisibleStatusBarTag>()

        if (authStatus.authenticated) {
            tags.add(InvisibleStatusBarTag.IsAuthenticated)
        } else if (authStatus.showInvalidAccessTokenError || authStatus.showNetworkError) {
            tags.add(InvisibleStatusBarTag.HasErrors)
        }
        if (errors.size > 0) {
            tags.add(InvisibleStatusBarTag.HasErrors)
        }
        if (loaders.size > 0) {
            tags.add(InvisibleStatusBarTag.HasLoaders)
        }
        if (ignoreStatus !== false) {
            tags.add(InvisibleStatusBarTag.IsIgnored)
        }
        if (authStatus.pendingValidation) {
            return {
                icon: 'loading',
                tooltip: 'Signing In...',
                style: 'normal',
                tags,
                interact: interactAuth,
            }
        }
        if (!authStatus.authenticated && authStatus.showNetworkError) {
            return {
                icon: 'disabled',
                tooltip: 'Network issues prevented Cody from signing in.',
                style: 'error',
                tags,
                interact: interactAuth,
            }
        }
        if (!authStatus.authenticated && authStatus.showInvalidAccessTokenError) {
            return {
                icon: 'disabled',
                tooltip: 'Your authentication has expired.\nSign in again to continue using Cody.',
                style: 'warning',
                tags,
                interact: interactAuth,
            }
        }
        if (!authStatus.authenticated) {
            return {
                text: 'Sign In',
                tooltip: 'Sign in to get started with Cody.',
                style: 'warning',
                tags,
                interact: interactAuth,
            }
        }

        if (errors.size > 0) {
            const [firstError, ...otherErrors] = [...errors.values()]
            const hasDisabilitatingError = [...errors.values()].some(
                error =>
                    error.errorType in
                    (['AutoCompleteDisabledByAdmin', 'RateLimitError'] satisfies StatusBarErrorType[])
            )
            return {
                text: '',
                icon: hasDisabilitatingError ? 'disabled' : 'normal',
                tooltip:
                    otherErrors.length > 0
                        ? `(Error 1/${otherErrors.length + 1}): ${firstError.title}`
                        : `Error: ${firstError.title}`,
                style: 'error',
                tags,
                interact: interactDefault({
                    config,
                    errors,
                    isIgnored: ignoreStatus,
                }),
            }
        }

        if (loaders.size > 0) {
            const isStarting = [...loaders.values()].some(loader => loader.kind === 'startup')
            return {
                icon: 'loading',
                tooltip: isStarting
                    ? 'Cody is getting ready...'
                    : `${loaders.values().next().value.title}`,
                style: 'normal',
                tags,
                interact: interactDefault({
                    config,
                    errors,
                    isIgnored: ignoreStatus,
                }),
            }
        }

        if (ignoreStatus !== false) {
            return {
                icon: 'disabled',
                tooltip: ignoreReason(ignoreStatus)!,
                style: 'disabled',
                tags,
                interact: interactDefault({
                    config,
                    errors,
                    isIgnored: ignoreStatus,
                }),
            }
        }

        return {
            tooltip: 'Cody Settings',
            interact: interactDefault({
                config,
                errors,
                isIgnored: ignoreStatus,
            }),
        }
    }

    private dispose() {
        this.errors.complete()
        this.loaders.complete()
        this.statusBarItem.dispose()
        this.command.dispose()
        this.renderSubscription?.unsubscribe()
        singleton = undefined
    }
}

async function interactAuth(abort: AbortSignal) {
    void vscode.commands.executeCommand('cody.chat.focus')
}

function interactDefault({
    config,
    errors,
    isIgnored,
}: { config: ResolvedConfiguration; errors: ReadonlySet<StatusBarError>; isIgnored: IsIgnored }): (
    abort: AbortSignal
) => Promise<void> {
    return async (abort: AbortSignal) => {
        const [interactionDone] = promise<void>()
        // this QuickPick could probably be made reactive but that's a bit overkill.
        const quickPick = vscode.window.createQuickPick()
        const currentIgnoreReason = ignoreReason(isIgnored)
        const abortListener = () => {
            quickPick?.hide()
        }
        quickPick.onDidHide(() => {
            interactionDone()
        })
        abort.addEventListener('abort', abortListener)
        quickPick.onDidHide(() => {
            abort.removeEventListener('abort', abortListener)
        })

        for (const error of errors) {
            try {
                error.onShow?.()
            } catch (e) {
                logError('Status Bar Interaction', 'Error during show handler')
            }
        }
        const createFeatureToggle = featureToggleBuilder(
            config.configuration,
            vscode.workspace.getConfiguration()
        )

        quickPick.items = [
            // These description should stay in sync with the settings in package.json
            ...(errors.size > 0
                ? [
                      { label: 'notice', kind: vscode.QuickPickItemKind.Separator },
                      ...[...errors.values()].map(error => ({
                          label: `$(alert) ${error.title}`,
                          description: '',
                          detail: QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX + error.description,
                          onSelect: error.onSelect,
                      })),
                  ]
                : []),
            { label: 'notice', kind: vscode.QuickPickItemKind.Separator },
            ...(currentIgnoreReason
                ? [
                      {
                          label: '$(debug-pause) Cody is disabled in this file',
                          description: '',
                          detail: QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX + currentIgnoreReason,
                      },
                  ]
                : []),
            { label: 'enable/disable features', kind: vscode.QuickPickItemKind.Separator },
            await createFeatureToggle(
                'Code Autocomplete',
                undefined,
                'Enable Cody-powered code autocompletions',
                'cody.autocomplete.enabled',
                c => c.autocomplete,
                false,
                [
                    {
                        iconPath: new vscode.ThemeIcon('settings-more-action'),
                        tooltip: 'Autocomplete Settings',
                        onClick: () =>
                            vscode.commands.executeCommand('workbench.action.openSettings', {
                                query: '@ext:sourcegraph.cody-ai autocomplete',
                            }),
                    } as vscode.QuickInputButton,
                ]
            ),
            await createFeatureToggle(
                'Code Actions',
                undefined,
                'Enable Cody fix and explain options in the Quick Fix menu',
                'cody.codeActions.enabled',
                c => c.codeActions
            ),
            await createFeatureToggle(
                'Code Lenses',
                undefined,
                'Enable Code Lenses in documents for quick access to Cody commands',
                'cody.commandCodeLenses',
                c => c.commandCodeLenses
            ),
            await createFeatureToggle(
                'Command Hints',
                undefined,
                'Enable hints for Cody commands such as "Opt+K to Edit" or "Opt+D to Document"',
                'cody.commandHints.enabled',
                async () => {
                    const enablement = await getGhostHintEnablement()
                    return enablement.Document || enablement.EditOrChat || enablement.Generate
                }
            ),
            { label: 'settings', kind: vscode.QuickPickItemKind.Separator },
            {
                label: '$(gear) Cody Extension Settings',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand('cody.settings.extension')
                },
            },
            {
                label: '$(symbol-namespace) Custom Commands Settings',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand('cody.menu.commands-settings')
                },
            },
            {
                label: '$(keyboard) Keyboard Shortcuts',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand(
                        'workbench.action.openGlobalKeybindings',
                        '@ext:sourcegraph.cody-ai'
                    )
                },
            },
            { label: 'feedback & support', kind: vscode.QuickPickItemKind.Separator },
            ...SupportOptionItems,
            ...FeedbackOptionItems,
            { label: `v${version}`, kind: vscode.QuickPickItemKind.Separator },
            {
                label: '$(cody-logo) Cody Release Blog',
                async onSelect(): Promise<void> {
                    await vscode.commands.executeCommand(
                        'vscode.open',
                        getReleaseNotesURLByIDE(version, CodyIDE.VSCode)
                    )
                },
            },
        ].filter(Boolean)
        quickPick.title = 'Cody Settings'
        quickPick.placeholder = 'Choose an option'
        quickPick.matchOnDescription = true
        quickPick.show()
        quickPick.onDidAccept(() => {
            const option = quickPick.activeItems[0] as StatusBarItem
            if (option && 'onSelect' in option) {
                option.onSelect().catch(console.error)
            }
            quickPick.hide()
        })
        quickPick.onDidTriggerItemButton(item => {
            // @ts-ignore: onClick is a custom extension to the QuickInputButton
            item?.button?.onClick?.()
            quickPick.hide()
        })
        // Debug Mode
        quickPick.buttons = [
            {
                iconPath: new vscode.ThemeIcon('bug'),
                tooltip: config.configuration.debugVerbose ? 'Check Debug Logs' : 'Turn on Debug Mode',
                onClick: () => enableVerboseDebugMode(),
            } as vscode.QuickInputButton,
        ]
        quickPick.onDidTriggerButton(async item => {
            // @ts-ignore: onClick is a custom extension to the QuickInputButton
            item?.onClick?.()
            quickPick.hide()
        })
    }
}

function featureToggleBuilder(
    config: ReadonlyDeep<ClientConfiguration>,
    workspaceConfig: vscode.WorkspaceConfiguration
) {
    return async (
        name: string,
        description: string | undefined,
        detail: string,
        setting: string,
        getValue: (config: ReadonlyDeep<ClientConfiguration>) => boolean | Promise<boolean>,
        requiresReload = false,
        buttons: readonly vscode.QuickInputButton[] | undefined = undefined
    ): Promise<StatusBarItem> => {
        const isEnabled = await getValue(config)
        return {
            label:
                (isEnabled ? QUICK_PICK_ITEM_CHECKED_PREFIX : QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX) +
                name,
            description,
            detail: QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX + detail,
            onSelect: async () => {
                await workspaceConfig.update(setting, !isEnabled, vscode.ConfigurationTarget.Global)

                const info = `${name} ${isEnabled ? 'disabled' : 'enabled'}.`
                const response = await (requiresReload
                    ? vscode.window.showInformationMessage(info, 'Reload Window')
                    : vscode.window.showInformationMessage(info))

                if (response === 'Reload Window') {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow')
                }
            },
            buttons,
        }
    }
}

function ignoreReason(isIgnore: IsIgnored): string | null {
    switch (isIgnore) {
        case false:
            return null
        case 'non-file-uri':
            return 'This current file is ignored as it does not have a valid file URI.'
        case 'no-repo-found':
            return 'This current file is ignored as it is not in known git repository.'
        case 'has-ignore-everything-filters':
            return 'Your administrator has disabled Cody for this file.'
        default:
            if (isIgnore.startsWith('repo:')) {
                return `Your administrator has disabled Cody for '${isIgnore.replace('repo:', '')}'.`
            }
            return 'The current file is ignored by Cody.'
    }
}

interface StatusBarLoaderArgs {
    title: string
    timeout?: Milliseconds
    kind?: 'startup' | 'feature'
}

//this is mainly done to ensure the type shows up as Milliseconds not 'number'
type Milliseconds = LiteralUnion<30_000, number>

interface StatusBarErrorArgs {
    title: string
    description: string
    errorType: StatusBarErrorType
    removeAfterSelected: boolean
    timeout?: Milliseconds
    onShow?: () => void
    onSelect?: () => void | Promise<void>
}

interface StatusBarError {
    createdAt: number
    title: string
    description: string
    errorType: StatusBarErrorType
    onSelect: () => void
    onShow?: () => void
}

interface StatusBarLoader {
    createdAt: number
    title: string
    kind: 'startup' | 'feature'
}

type StatusBarErrorType = 'auth' | 'RateLimitError' | 'AutoCompleteDisabledByAdmin'

interface StatusBarItem extends vscode.QuickPickItem {
    onSelect: () => Promise<void>
}
