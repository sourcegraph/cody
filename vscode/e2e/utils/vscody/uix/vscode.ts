import type { execSync } from 'node:child_process'
import type * as fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import URL from 'node:url'
import { test as t } from '@playwright/test'
import type { GreaterThanOrEqual, Integer } from 'type-fest'
import type * as vscode from 'vscode'
import type { UIXContextFnContext } from '.'

type SidebarCtx = Pick<UIXContextFnContext, 'page'>

export function activeEditor(ctx: Pick<UIXContextFnContext, 'page'>) {
    return ctx.page.locator('.editor-group-container.active')
}
export class Sidebar {
    public static readonly CODY_VIEW_ID = 'workbench.view.extension.cody'

    private constructor(private ctx: SidebarCtx) {}

    public static get(ctx: SidebarCtx) {
        return new Sidebar(ctx)
    }

    public get locator() {
        return this.ctx.page.locator('#workbench\\.parts\\.sidebar')
    }

    private get splitViewContainer() {
        return this.locator.locator('xpath=ancestor::*[contains(@class, "split-view-view")]').last()
    }

    /**
     * The viewlet is the content of the sidebar. Any webview will get
     * positioned as anchored to this.
     */
    private get viewlet() {
        return this.locator.locator('.composite.viewlet').first()
    }

    public async isVisible() {
        return await t.step('Sidebar.isVisible', async () => {
            const classes = await this.splitViewContainer.getAttribute('class')
            return classes?.split(' ').includes('visible')
        })
    }

    public get activeView() {
        return this.viewlet.getAttribute('id')
    }
}

export async function startSession({
    page,
    vscodeUI,
    workspaceDir,
}: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'executeCommand' | 'workspaceDir'>) {
    // If we have a debugger then we show some user instructions
    const { extensionHostDebugPort } = vscodeUI

    const interceptRouteURL = `${URL.resolve(vscodeUI.url, '/**')}`
    if (extensionHostDebugPort) {
        await t.step('Show Debug Instructions', async () => {
            // load a landing page before the session is initialized
            const placeholderDir = path.join(__dirname, '../resources/vscode-placeholder')
            await page.route(interceptRouteURL, async (route, request) => {
                // serve local modified HTML or any of the resources requested
                if (request.url() === URL.resolve(vscodeUI.url, '/')) {
                    route.fulfill({
                        body: (
                            await fsPromise.readFile(path.join(placeholderDir, 'index.html'), 'utf-8')
                        ).replaceAll('{{DEBUG_PORT}}', extensionHostDebugPort.toString()),
                        headers: {
                            'Content-Type': 'text/html',
                        },
                        status: 200,
                    })
                } else {
                    const pathParts = request.url().replace(vscodeUI.url, '').split('/')
                    route.fulfill({
                        path: path.join(placeholderDir, ...pathParts),
                    })
                }
            })
            await page.goto(vscodeUI.url)
        })
    }
    return t.step('Start VSCode Session', async () => {
        if (page.url() !== vscodeUI.url) {
            await page.route(interceptRouteURL, route => {
                route.fulfill({
                    status: 200,
                    body: '',
                })
            })
            await page.goto(vscodeUI.url)
        }

        // User settings are stored in IndexDB though so we need to get a bit
        // clever. Normal "user settings" are better stored in Machine settings
        // so that they can be easily edited as a normal file. Machine settings
        // don't cover security sensitive settings though.
        const userSettingsOk = await page.evaluate(async () => {
            const openDatabase = () => {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open('vscode-web-db')

                    request.onupgradeneeded = (event: any) => {
                        const db = event.target.result
                        if (!db.objectStoreNames.contains('vscode-userdata-store')) {
                            db.createObjectStore('vscode-userdata-store')
                        }
                    }

                    request.onsuccess = (event: any) => {
                        resolve(event.target.result)
                    }

                    request.onerror = (event: any) => {
                        reject(event.target.errorCode)
                    }
                })
            }
            const putData = (db: any) => {
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(['vscode-userdata-store'], 'readwrite')
                    const store = transaction.objectStore('vscode-userdata-store')
                    //TODO: Configurable overwrites
                    const settingsJSON = JSON.stringify(
                        {
                            'security.workspace.trust.enabled': false,
                            'extensions.autoCheckUpdates': false,
                            'extensions.autoUpdate': false,
                            'update.mode': 'none',
                            'update.showReleaseNotes': false,
                            'code-runner.enableAppInsights': false,
                            'telemetry.enableCrashReporter': false,
                            'telemetry.enableTelemetry': false,
                            'telemetry.telemetryLevel': 'off',
                        },
                        null,
                        2
                    )
                    const settingsData = new TextEncoder().encode(settingsJSON)
                    const putRequest = store.put(settingsData, '/User/settings.json')
                    putRequest.onsuccess = () => {
                        resolve(void 0)
                    }
                    putRequest.onerror = (event: any) => {
                        console.error(event)
                        reject(event.target.errorCode)
                    }
                })
            }

            try {
                const db = await openDatabase()
                await putData(db)
                return true
            } catch (error) {
                console.error('Error accessing IndexedDB:', error)
                return false
            }
        })

        if (!userSettingsOk) {
            throw new Error('Failed to initialize VSCode User Settings')
        }

        // we remove any mock handlers so that we can load the real deal
        page.unroute(interceptRouteURL)

        // We also make sure that on page loads we expose the VSCodeAPI
        await page.addInitScript(async () => {
            // only run this in the main frame
            if (window && window.self === window.top) {
                if (document.querySelector('meta[name="__exposed-vscode-api__"]') !== null) {
                    return
                }
                while (true) {
                    try {
                        const code = window.require('vs/workbench/workbench.web.main')
                        //@ts-ignore
                        window._vscode = code
                        //@ts-ignore
                        window._executeCommand = code.commands.executeCommand
                        // insert the meta tag if it doesn't already exist
                        // await page.waitForSelector('meta[name="__exposed-vscode-api__"]', { timeout: 1000 })
                        const meta = document.createElement('meta')
                        meta.setAttribute('name', '__exposed-vscode-api__')
                        meta.setAttribute('content', 'true')
                        document.head.appendChild(meta)
                        return
                    } catch (err) {
                        // We'll try again in a bit. Eitehr require wasn't loaded yet or the module isn't imported yet
                        await new Promise(resolve => {
                            setTimeout(resolve, 100)
                        })
                    }
                }
            }
        })

        // We can now authenticate and navigate to the UI
        await page.goto(`${vscodeUI.url}?tkn=${vscodeUI.token}&folder=${path.resolve(workspaceDir)}`)

        // wait for the UI to be ready
        await page.locator('iframe.web-worker-ext-host-iframe').waitFor({
            state: 'attached',
            timeout: 10000,
        })
    })
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
/** This function allows you to eval a custom script inside of VSCode with access to all the VSCode APIs */

export function evalFn<Args extends Array<any> = [], Return = void>(
    fn: JavascriptFn<Args, Return>,
    args: Args,
    { executeCommand }: Pick<UIXContextFnContext, 'executeCommand'>
): Promise<Return> {
    return executeCommand('vscody.eval', [fn.toString(), ...args])
}

type OpenFileArgs = (
    | { file: string; workspaceFile?: never }
    | {
          workspaceFile: string
          file?: never
      }
) & {
    selection?: SingleSelection
    viewColumn?: number | 'active' | 'beside' | 'split'
}
export async function openFile(args: OpenFileArgs, ctx: Pick<UIXContextFnContext, 'executeCommand'>) {
    const file = await evalFn(
        async function (args) {
            const { file = `\${workspaceFolder}/${args.workspaceFile}`, viewColumn } = args
            const uri = this.vscode.Uri.file(this.utils.substitutePathVars(file))
            const showOptions = { preserveFocus: true, preview: false, viewColumn }
            await this.vscode.commands.executeCommand('vscode.open', uri, showOptions)
            return uri
        },
        [args],
        ctx
    )
    if (args.selection) {
        //TODO: pass in returned file
        await select({ selection: args.selection }, ctx)
    }
    return file
}

type Idx = number & { __type: 'integer'; __start: 1 }
export function idx<T extends number>(
    v: GreaterThanOrEqual<T, 1> extends true ? Integer<T> : never
): Idx {
    return v as unknown as Idx
}

// type Index = number & { __type: 'integer'; __/start: 1 }
//Only allow conversion to index for integers > 1

type SingleSelection =
    | { line: Idx; character?: Idx; start?: never; end?: never }
    | {
          start: { line: Idx; character?: Idx; start?: never; end?: never }
          end?: { line: Idx; character?: Idx; start?: never; end?: never }
      }
interface SelectArgs {
    selection: SingleSelection
}
export async function select(args: SelectArgs, ctx: Pick<UIXContextFnContext, 'executeCommand'>) {
    //TODO: We might want to activate a specific file. For now we just assume the currently active one
    return evalFn(
        async function (args) {
            const editor = this.vscode.window.activeTextEditor
            if (!editor) {
                throw new Error('No editor is active')
            }
            const { line: startLine, character: startCharacter = 1 } =
                args.selection.start || args.selection
            const { line: endLine, character: endCharacter = 1 } =
                args.selection.end || args.selection.start || args.selection
            const fromPosition = new this.vscode.Position(startLine - 1, startCharacter - 1)
            const toPosition = new this.vscode.Position(endLine - 1, endCharacter - 1)
            editor.selections = [new this.vscode.Selection(fromPosition, toPosition)]
            editor.revealRange(
                editor.selection,
                this.vscode.TextEditorRevealType.InCenterIfOutsideViewport
            )
        },
        [args],
        ctx
    )
}
