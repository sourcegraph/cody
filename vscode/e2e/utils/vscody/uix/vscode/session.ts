import type { execSync } from 'node:child_process'
import type * as fs from 'node:fs'
import type path from 'node:path'
import { test } from '@playwright/test'
import type * as vscode from 'vscode'
import type { UIXContextFnContext } from '..'
import { Editor, Notifications, QuickPick, Sidebar, start } from './internal'

export class Session {
    private started = false
    private constructor(private init: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'workspaceDir'>) {
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
                return this.page.evaluate(
                    async ({ command, args, skipResult }) => {
                        //@ts-ignore
                        let res = window.__testUtils.vscode.executeCommand(command, ...args)
                        // we forward the event loop

                        if (skipResult) {
                            await new Promise(r => setTimeout(r, 0))
                            return undefined
                        }
                        res = await res
                        await new Promise(r => setTimeout(r, 0))
                        return res
                    },
                    {
                        command,
                        args,
                        skipResult,
                    }
                )
            },
            { box: true }
        )
    }

    runMacro<Return = unknown, Args extends Array<any> = []>(
        name: string,
        fn: JavascriptFn<Args, Return>,
        args: Args
    ): Promise<Return> {
        return this.runCommand<Return, [string, ...Args]>(
            { command: 'vscody.eval', name: `runMacro<${name}>` },
            fn.toString(),
            ...args
        )
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

    static pending(init: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'workspaceDir'>) {
        return new Session(init)
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
        this.started = true
        return this
    }
}

interface EvalScriptContext {
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
type JavascriptFn<Args extends Array<any> = [], Return = void> = (
    this: EvalScriptContext,
    ...args: Args
) => Promise<Return>
