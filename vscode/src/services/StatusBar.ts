import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ClientConfiguration,
    CodyIDE,
    type IsIgnored,
    ObservableArray,
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
import dedent from 'dedent'
import { type Subscription, map } from 'observable-fns'
import type { LiteralUnion, ReadonlyDeep } from 'type-fest'
import { getGhostHintEnablement } from '../commands/GhostHintDecorator'
import { getReleaseNotesURLByIDE } from '../release'
import { version } from '../version'
import { FeedbackOptionItems, SupportOptionItems } from './FeedbackOptions'
import { enableVerboseDebugMode } from './utils/export-logs'

let singleton: CodyStatusBar | undefined = undefined

// const DEFAULT_TEXT = '$(cody-logo-heavy)'
// const DEFAULT_TEXT_DISABLED = '$(cody-logo-heavy-slash) File Ignored'
// const DEFAULT_TOOLTIP = 'Cody Settings'
// const DEFAULT_TOOLTIP_DISABLED = 'The current file is ignored by Cody'

const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check) '
const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0 '

const ONE_HOUR = 60 * 60 * 1000

const STATUS_BAR_INTERACTION_COMMAND = 'cody.status-bar.interacted'

interface StatusBarState {
    text: string
    tooltip: string
    style: 'normal' | 'warning' | 'error' | 'disabled'

    interact: (abortSignal: AbortSignal) => Promise<void> | void
}
export class CodyStatusBar {
    private errors = new ObservableArray<StatusBarError>()
    private loaders = new ObservableArray<StatusBarLoader>()
    private renderSubscription: Subscription<any>
    private currentInteraction: AbortController | undefined

    private statusBarItem = vscode.window.createStatusBarItem(
        'extension-status',
        vscode.StatusBarAlignment.Right
    )
    private command = vscode.commands.registerCommand(
        STATUS_BAR_INTERACTION_COMMAND,
        this.handleInteraction
    )

    private ignoreStatus = combineLatest(
        fromVSCodeEvent(
            vscode.window.onDidChangeActiveTextEditor,
            () => vscode.window.activeTextEditor
        ).pipe(distinctUntilChanged()),
        authStatus, // TODO: technically this shouldn't be needed but the contextFilterProvider doesn't update on auth changes yet
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
            return this.buildState(...(combined as unknown as [any, any, any, any, any]))
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
    //     this.disposables.push()

    //     this.disposables.push()
    //     const renderSubscription = combineLatest(this.errors.changes(), authStatus)
    //     // this.statusBarItem.command = STATUS_BAR_INTERACTION_COMMAND
    //     // this.statusBarItem.show()
    // }

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

        // we create an empty
        const errorHandle = {}
        const scheduledRemoval = setTimeout(() => {
            this.errors.remove(errorHandle)
        }, ttl)
        const removeFn = () => {
            clearTimeout(scheduledRemoval)
            this.errors.remove(errorHandle)
        }
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

        this.errors.push(errorObject)
        return removeFn
    }

    addLoader<T>(args: StatusBarLoaderArgs) {
        const now = Date.now()
        const ttl = args.timeout !== undefined ? Math.min(ONE_HOUR, args.timeout - now) : ONE_HOUR
        const loaderHandle = {}
        const scheduledRemoval = setTimeout(() => {
            this.errors.remove(loaderHandle)
        }, ttl)
        const removeFn = () => {
            clearTimeout(scheduledRemoval)
            this.errors.remove(loaderHandle)
        }
        const loaderObject = Object.assign(loaderHandle, {
            createdAt: now,
            title: args.title,
        })
        this.loaders.push(loaderObject)
        return removeFn
    }

    hasError(
        filterFn?: (
            v: Pick<StatusBarError, 'createdAt' | 'description' | 'errorType' | 'title'>
        ) => boolean
    ): boolean {
        const errors = this.errors.get()
        if (filterFn) {
            return errors.some(filterFn)
        }
        return errors.length > 0
    }
    // startLoading

    // startLoading(label: string, params: { timeoutMs?: number } = {}) {
    //     openLoadingLeases++
    //     statusBarItem.tooltip = label
    //     rerender()

    //     let didClose = false
    //     const timeoutId = params.timeoutMs ? setTimeout(stopLoading, params.timeoutMs) : null
    //     function stopLoading() {
    //         if (didClose) {
    //             return
    //         }
    //         didClose = true

    //         openLoadingLeases--
    //         rerender()
    //         if (timeoutId) {
    //             clearTimeout(timeoutId)
    //         }
    //     }

    //     return stopLoading
    // },

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
        this.statusBarItem.text = newState.text
        this.statusBarItem.tooltip = newState.tooltip
        switch (newState.style) {
            case 'normal':
            case 'disabled':
            case 'warning':
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
        errors: ReadonlyArray<StatusBarError>,
        loaders: ReadonlyArray<StatusBarLoader>,
        ignoreStatus: IsIgnored
    ): StatusBarState {
        if (authStatus.pendingValidation) {
            return {
                text: '$(loading~spin)',
                tooltip: 'Signing In...',
                style: 'normal',
                interact: interactAuth,
            }
        }
        if (!authStatus.authenticated && authStatus.showNetworkError) {
            return {
                text: '$(cody-logo-heavy-slash)',
                tooltip: 'Network issues prevented Cody from signing in.',
                style: 'error',
                interact: interactAuth,
            }
        }
        if (!authStatus.authenticated && authStatus.showInvalidAccessTokenError) {
            return {
                text: '$(cody-logo-heavy-slash)',
                tooltip: 'Your authentication has expired. Sign in again to continue using Cody.',
                style: 'error',
                interact: interactAuth,
            }
        }
        if (!authStatus.authenticated) {
            return {
                text: '$(cody-logo-heavy) Sign In',
                tooltip: 'Sign in to get started with Cody.',
                style: 'warning',
                interact: interactAuth,
            }
        }

        if (errors.length > 0) {
            const errorDetails = errors
                .map(error => {
                    dedent`
                    **${error.title}**

                    ${error.description}
                    `
                })
                .join('\n\n')
            const errorContent = dedent`
                ## Errors:
                ---

                ${errorDetails}
                `.trim()
            const hasDisabilitatingError = errors.some(
                error =>
                    error.errorType in
                    (['AutoCompleteDisabledByAdmin', 'RateLimitError'] satisfies StatusBarErrorType[])
            )
            return {
                text: hasDisabilitatingError ? '$(cody-logo-heavy-slash)' : '$(cody-logo-heavy)',
                tooltip: errorContent,
                style: 'error',
                interact: interactDefault({
                    config,
                    errors,
                    isIgnored: ignoreStatus,
                }),
            }
        }

        if (loaders.length > 0) {
            return {
                text: '$(loading~spin)',
                tooltip: loaders[0].title,
                style: 'normal',
                interact: () => {
                    //todo:
                },
                // interact: interactDefault({
                //     isIgnored: ignoreStatus,
                // }),
            }
        }

        if (ignoreStatus !== false) {
            return {
                text: '$(cody-logo-heavy-slash)',
                tooltip: ignoreReason(ignoreStatus) ?? 'The current file is ignored by Cody',
                style: 'disabled',
                interact: interactDefault({
                    config,
                    errors,
                    isIgnored: ignoreStatus,
                }),
            }
        }

        return {
            text: '$(_cody-hidden-state)$(cody-logo-heavy)',
            tooltip: 'Cody Settings',
            style: 'normal',
            interact: interactDefault({
                config,
                errors,
                isIgnored: ignoreStatus,
            }),
        }

        // const defaultState = {
        //     text: '$(cody-logo-heavy)',
        //     tooltip: '',
        //     interact: interactDefault,
        //     backgroundColor: 'statusBarItem.activeBackground',
        // } satisfies StatusBarState

        // if (loadingLeases > 0) {
        //     defaultState.text = '$(loading~spin)'
        // } else {
        //     statusBarItem.text = isCodyIgnoredType ? DEFAULT_TEXT_DISABLED : DEFAULT_TEXT
        //     statusBarItem.tooltip = isCodyIgnoredType ? DEFAULT_TOOLTIP_DISABLED : DEFAULT_TOOLTIP
        // }

        // if (ignoreStatus !== false) {
        //     return {
        //         text: '$()',
        //     }
        // }

        // if (!authStatus.authenticated && authStatus.showNetworkError) {
        //     statusBarItem.text = '$(cody-logo-heavy) Connection Issues'
        //     statusBarItem.tooltip = 'Resolve network issues for Cody to work again'
        //     statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
        //     return
        // }
        // if (!authStatus.authenticated) {
        //     statusBarItem.text = '$(cody-logo-heavy) Sign In'
        //     statusBarItem.tooltip = 'Sign in to get started with Cody'
        //     statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        //     return
        // }

        // if (errors.length > 0) {
        //     statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        //     statusBarItem.tooltip = errors[0].error.title
        // } else {
        //     statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.activeBackground')
        // }

        // return {
        //     visible: true,
        // }
    }

    private dispose() {
        this.statusBarItem.dispose()
        this.command.dispose()
        this.renderSubscription?.unsubscribe()
        singleton = undefined
    }

    // dispose(): void
    // startLoading(
    //     label: string,
    //     params?: {
    //         // When set, the loading lease will expire after the timeout to avoid getting stuck
    //         timeoutMs: number
    //     }
    // ): () => void
    // addError(error: StatusBarError): () => void
    // hasError(error: StatusBarErrorName): boolean
    // setAuthStatus(newStatus: AuthStatus): void

    // private async handleInteraction() {
    //     this.pendingInteraction?.abort()
    //     const interaction = new AbortController()
    //     this.pendingInteraction = interaction

    //     const currentState = await firstValueFrom(this.state, interaction.signal).catch(e => {
    //         if (interaction.signal.aborted) {
    //             return null
    //         }
    //         throw e
    //     })
    //     if (!currentState) {
    //         return
    //     }

    //     telemetryRecorder.recordEvent('cody.statusbarIcon', 'clicked', {
    //         privateMetadata: { loggedIn: Boolean(currentState.isAuthenticated) },
    //         billingMetadata: {
    //             category: 'billable',
    //             product: 'cody',
    //         },
    //     })

    //     const workspaceConfig = vscode.workspace.getConfiguration()

    //     try {
    //         // const configSnapshot = getConfiguration()

    //         if (!authStatus?.authenticated) {
    //             // Bring up the sidebar view
    //             void vscode.commands.executeCommand('cody.chat.focus')
    //             return
    //         }

    //         // const workspaceConfig = vscode.workspace.getConfiguration()
    //         // const config = getConfiguration(workspaceConfig)

    //         if (errors.length > 0) {
    //             errors.map(error => error.error.onShow?.())
    //         }
    //     } finally {
    //         this.handlingInteraction = false
    //     }
    // }
}

async function interactAuth(abort: AbortSignal) {
    void vscode.commands.executeCommand('cody.chat.focus')
}

function interactDefault({
    config,
    errors,
    isIgnored,
}: { config: ResolvedConfiguration; errors: ReadonlyArray<StatusBarError>; isIgnored: IsIgnored }): (
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
            ...(errors.length > 0
                ? [
                      { label: 'notice', kind: vscode.QuickPickItemKind.Separator },
                      ...errors.map(error => ({
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
            return 'This file is disabled as it does not have a valid file URI.'
        case 'no-repo-found':
            return 'This file is disabled as it is not in known repository.'
        case 'has-ignore-everything-filters':
            return 'Your administrator has disabled Cody for this file.'
        default:
            if (isIgnore.startsWith('repo:')) {
                return `Your administrator has disabled Cody for '${isIgnore.replace('repo:', '')}'.`
            }
            return 'Cody is not available for this file.'
    }
}

interface StatusBarLoaderArgs {
    title: string
    timeout?: Milliseconds
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
}

type StatusBarErrorType = 'auth' | 'RateLimitError' | 'AutoCompleteDisabledByAdmin'

interface StatusBarItem extends vscode.QuickPickItem {
    onSelect: () => Promise<void>
}

// export function createStatusBar(): CodyStatusBar {
//     // const statusBarItem = (statusBarItem.text = DEFAULT_TEXT)
//     // statusBarItem.tooltip = DEFAULT_TOOLTIP
//     // statusBarItem.command = STATUS_BAR_INTERACTION_COMMAND
//     // statusBarItem.show()

//     let isCodyIgnoredType: null | CodyIgnoreType = null
//     async function updateIgnoreStatus(uri: vscode.Uri | undefined): Promise<void> {
//         if (!uri) {
//             isCodyIgnoredType = null
//             return
//         }
//         isCodyIgnoredType = (await contextFiltersProvider.isUriIgnored(uri)) ? 'context-filter' : null
//         rerender()
//     }
//     const onDocumentChange = vscode.window.onDidChangeActiveTextEditor(editor =>
//         updateIgnoreStatus(editor?.document.uri)
//     )
//     // Initial check for the current active editor
//     updateIgnoreStatus(vscode.window.activeTextEditor?.document?.uri)

//     let authStatus: AuthStatus | undefined
//     // const command = vscode.commands.registerCommand(STATUS_BAR_INTERACTION_COMMAND, async )

//     // Reference counting to ensure loading states are handled consistently across different
//     // features
//     // TODO: Ensure the label is always set to the right value too.
//     let openLoadingLeases = 0

//     const errors: { error: StatusBarError; createdAt: number }[] = []

//     // function rerender(): void {
//     //     if (openLoadingLeases > 0) {
//     //         statusBarItem.text = '$(loading~spin)'
//     //     } else {
//     //         statusBarItem.text = isCodyIgnoredType ? DEFAULT_TEXT_DISABLED : DEFAULT_TEXT
//     //         statusBarItem.tooltip = isCodyIgnoredType ? DEFAULT_TOOLTIP_DISABLED : DEFAULT_TOOLTIP
//     //     }

//     //     // Only show this if authStatus is present, otherwise you get a flash of
//     //     // yellow status bar icon when extension first loads but login hasn't
//     //     // initialized yet
//     //     if (!authStatus.authenticated && authStatus.showNetworkError) {
//     //         statusBarItem.text = '$(cody-logo-heavy) Connection Issues'
//     //         statusBarItem.tooltip = 'Resolve network issues for Cody to work again'
//     //         statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
//     //         return
//     //     }
//     //     if (!authStatus.authenticated) {
//     //         statusBarItem.text = '$(cody-logo-heavy) Sign In'
//     //         statusBarItem.tooltip = 'Sign in to get started with Cody'
//     //         statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
//     //         return
//     //     }

//     //     if (errors.length > 0) {
//     //         statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
//     //         statusBarItem.tooltip = errors[0].error.title
//     //     } else {
//     //         statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.activeBackground')
//     //     }
//     // }

//     // Clean up all errors after a certain time so they don't accumulate forever
//     function clearOutdatedErrors(): void {
//         const now = Date.now()
//         for (let i = errors.length - 1; i >= 0; i--) {
//             const error = errors[i]
//             if (
//                 now - error.createdAt >= ONE_HOUR ||
//                 (error.error.removeAfterEpoch && now - error.error.removeAfterEpoch >= 0)
//             ) {
//                 errors.splice(i, 1)
//             }
//         }
//         rerender()
//     }

//     return {
//         startLoading(label: string, params: { timeoutMs?: number } = {}) {
//             openLoadingLeases++
//             statusBarItem.tooltip = label
//             rerender()

//             let didClose = false
//             const timeoutId = params.timeoutMs ? setTimeout(stopLoading, params.timeoutMs) : null
//             function stopLoading() {
//                 if (didClose) {
//                     return
//                 }
//                 didClose = true

//                 openLoadingLeases--
//                 rerender()
//                 if (timeoutId) {
//                     clearTimeout(timeoutId)
//                 }
//             }

//             return stopLoading
//         },
//         addError(error: StatusBarError) {
//             const now = Date.now()
//             const errorObject = { error, createdAt: now }
//             errors.push(errorObject)

//             if (error.removeAfterEpoch && error.removeAfterEpoch > now) {
//                 setTimeout(clearOutdatedErrors, Math.min(ONE_HOUR, error.removeAfterEpoch - now))
//             } else {
//                 setTimeout(clearOutdatedErrors, ONE_HOUR)
//             }

//             rerender()

//             return () => {
//                 const index = errors.indexOf(errorObject)
//                 if (index !== -1) {
//                     errors.splice(index, 1)
//                     rerender()
//                 }
//             }
//         },
//         hasError(errorName: StatusBarErrorName): boolean {
//             return errors.some(e => e.error.errorType === errorName)
//         },
//         setAuthStatus(newStatus: AuthStatus) {
//             authStatus = newStatus
//             rerender()
//         },
//         dispose() {
//             statusBarItem.dispose()
//             command.dispose()
//             onDocumentChange.dispose()
//         },
//     }
// }
