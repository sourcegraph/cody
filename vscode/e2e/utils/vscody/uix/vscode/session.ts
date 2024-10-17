import type { execSync } from 'node:child_process'
import type * as fs from 'node:fs'
import type path from 'node:path'
import { type Locator, expect, test } from '@playwright/test'
import { type BirpcReturn, createBirpc } from 'birpc'
import Flatted from 'flatted'
import type * as vscode from 'vscode'
import { WebSocket } from 'ws'
import { type UIXContextFnContext, cody } from '..'
import { MITM_AUTH_TOKEN_PLACEHOLDER } from '../../constants'
import { StatusBarItem as CodyStatusBarItem } from '../cody'
import { modifySettings } from '../workspace'
import { Editor, Notifications, QuickPick, Sidebar, start } from './internal'

interface UtilServerFunctions {
    command: (command: string, args: any[], opts?: {}) => Promise<never>
    eval: <R>(script: string, args: any[], opts?: {}) => Promise<R>
}
export class Session {
    private started = false
    private testUtilsClient?: BirpcReturn<UtilServerFunctions, {}>

    private constructor(
        private init: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'workspaceDir' | 'polly'>
    ) {
        const session = this
        new Proxy(init.page, {
            get(target, prop, receiver) {
                if (!session.started) {
                    throw new Error('VSCode Session not started. Call VSCodeSession.start() first.')
                }
                return Reflect.get(target, prop, receiver)
            },
        })
    }

    runCommand<Return = unknown, Args extends Array<any> = []>(
        opts: { command: string; skipResult?: boolean; name?: string },
        ...args: Args
    ): Promise<Return>
    runCommand<Return = unknown, Args extends Array<any> = []>(
        command: string,
        ...args: Args
    ): Promise<Return>
    runCommand<Return = unknown, Args extends Array<any> = []>(
        commandOrOpts: string | { command: string; skipResult?: boolean; name?: string },
        ...args: Args
    ): Promise<Return> {
        const {
            command,
            skipResult,
            name = command,
        } = typeof commandOrOpts === 'string'
            ? { command: commandOrOpts, skipResult: undefined }
            : commandOrOpts
        return test.step(
            `Running command: ${name}`,
            () => {
                return this.testUtilsClient!.command(command, args, {
                    skipAwait: skipResult,
                })
            },
            { box: true }
        )
    }

    runMacro<Return = unknown, Args extends Array<any> = []>(
        name: string,
        fn: JavascriptFn<Args, Return>,
        args: Args
    ): Promise<Return> {
        return test.step(
            `Running macro: ${name}`,
            () => {
                return this.testUtilsClient!.eval(fn.toString(), args, {
                    skipAwait: false,
                })
            },
            { box: true }
        )
        // return this.runCommand<Return, [string, ...Args]>(
        //     { command: 'vscody.eval', name: `runMacro<${name}>` },
        //     fn.toString(),
        //     ...args
        // )
    }

    tick() {
        //wait for UI interactions to have been handled
        return this.runMacro(
            'void:tick',
            async () => {
                return null
            },
            []
        )
    }

    get page() {
        return this.init.page
    }

    static pending(init: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'workspaceDir' | 'polly'>) {
        return new Session(init)
    }

    static DEFAULT_START_OPTIONS = {
        preAuthenticateCody: true,
        waitForCody: true,
    }
    static startWithCody(
        init: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'workspaceDir' | 'polly'>,
        options?: { codyEndpoint?: string; preAuthenticateCody?: boolean; waitForCody?: boolean }
    ) {
        const combinedOptions = {
            ...Session.DEFAULT_START_OPTIONS,
            ...options,
        }
        return test.step('Starting VSCode Session', async () => {
            if (combinedOptions.codyEndpoint) {
                await modifySettings(
                    s => ({
                        ...s,
                        'cody.override.serverEndpoint': combinedOptions.codyEndpoint,
                        ...(combinedOptions.preAuthenticateCody
                            ? { 'cody.override.authToken': MITM_AUTH_TOKEN_PLACEHOLDER }
                            : {}),
                    }),
                    { workspaceDir: init.workspaceDir }
                )
            }
            const session = new Session(init)
            await session.start()
            const extension = cody.Extension.with(init)
            if (combinedOptions?.waitForCody) {
                await extension.waitUntilReady({
                    hasErrors: false,
                    isAuthenticated: !!(
                        combinedOptions.codyEndpoint && combinedOptions.preAuthenticateCody
                    ),
                })
            }
            return { vsc: session, cody: extension }
        })
    }

    get StatusBarItems(): StatusBarItems {
        const page = this.init.page
        return {
            get editorSelection() {
                return page.locator('.statusbar-item[id="status.editor.selection"]')
            },

            get cody() {
                return CodyStatusBarItem.with({ page: page })
            },

            get testUtils() {
                return page.locator('.statusbar-item[id="sourcegraph.vscody-test-utils.status"]')
            },
        }
    }

    get QuickPick(): QuickPick {
        //memoization
        Object.defineProperty(this, 'QuickPick', {
            value: QuickPick.for(this),
            writable: false,
        })
        return this.QuickPick
    }

    get Sidebar(): Sidebar {
        //memoization
        Object.defineProperty(this, 'Sidebar', {
            value: Sidebar.for(this),
            writable: false,
        })
        return this.Sidebar
    }

    get Notifications(): Notifications {
        //memoization
        Object.defineProperty(this, 'Notifications', {
            value: Notifications.for(this),
            writable: false,
        })
        return this.Notifications
    }

    get editor() {
        return Editor.for(this)
    }

    //TODO: CodeLens
    //TODO: Terminal
    //TODO: Notifications
    //TODO: Webviews

    async start(): Promise<Session> {
        await start(this.init)
        const testUtilsStatus = this.StatusBarItems.testUtils
        await expect(testUtilsStatus).toBeVisible()
        this.init.polly.pause()
        const utilsEndpoint = `ws://127.0.0.1:${this.init.vscodeUI.testUtilsWebsocketPort}`
        const ws = new WebSocket(utilsEndpoint)
        this.testUtilsClient = createBirpc<UtilServerFunctions>(
            {},
            {
                post: (data: any) => ws.send(data),
                on: (data: any) => ws.on('message', data),
                // these are required when using WebSocket
                serialize: v => Flatted.stringify(v),
                deserialize: v => Flatted.parse(v),
            }
        )
        this.init.polly.play()
        await expect(testUtilsStatus).toHaveText('Connected')
        this.started = true
        return this
    }
}

interface StatusBarItems {
    readonly cody: CodyStatusBarItem
    readonly editorSelection: Locator
    readonly testUtils: Locator
}

export interface EvalScriptContext {
    vscode: typeof vscode
    window: typeof vscode.window
    execSync: typeof execSync
    path: typeof path
    fs: typeof fs
    require: typeof require
    utils: {
        substitutePathVars: (path: string, relativeDocument?: vscode.TextDocument) => string
    }
}
export type JavascriptFn<Args extends Array<any> = [], Return = void> = (
    this: EvalScriptContext,
    ...args: Args
) => Promise<Return>
