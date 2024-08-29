import type { execSync } from 'node:child_process'
import type * as fs from 'node:fs'
import path from 'node:path'
import URL from 'node:url'
import { test as t } from '@playwright/test'
import type { GreaterThanOrEqual, Integer } from 'type-fest'
import type * as vscode from 'vscode'
import { URI } from 'vscode-uri'
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
    executeCommand,
}: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'executeCommand' | 'workspaceDir'>) {
    // If we have a debugger then we show some user instructions

    const interceptRouteURL = `${URL.resolve(vscodeUI.url, '/**')}`
    return t.step('Start VSCode Session', async () => {
        //Load some initial helpers. This will get expanded later with VSCode specific ones
        await page.addInitScript(testUtilsInitScript)

        if (page.url() !== vscodeUI.url) {
            await page.route(interceptRouteURL, route => {
                route.fulfill({
                    status: 200,
                    body: '',
                })
            })
            await page.goto(vscodeUI.url)
        }

        // Normal "user settings" are better stored in Machine settings so that
        // they can be easily edited as a normal file. Machine settings don't
        // cover security sensitive settings though which is why we directly
        // modify the state in IndexDB.
        const defaultsOk = await page.evaluate(async () => {
            const userSettings = JSON.stringify(
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
            //settings data is stored as Uint8Array
            const encodedUserSettings = new TextEncoder().encode(userSettings)
            //@ts-ignore
            await window.__testUtils.vscode.indexDB.put(
                'vscode-web-db',
                'vscode-userdata-store',
                '/User/settings.json',
                encodedUserSettings
            )

            // we disable some notifications that are just noise
            //@ts-ignore
            await window.__testUtils.vscode.indexDB.put(
                'vscode-web-state-db-global',
                'ItemTable',
                'notifications.perSourceDoNotDisturbMode',
                JSON.stringify([
                    {
                        id: 'vscode.git',
                        filter: 1,
                    },
                ])
            )
            return true
        })
        if (!defaultsOk) {
            throw new Error('Failed to initialize VSCode default settings')
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
                        Object.assign(window.__testUtils.vscode, {
                            browserAPI: code,
                            executeCommand: code.commands.executeCommand,
                        })
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
        const uriFolder = URI.file(path.resolve(workspaceDir))
        await page.goto(
            `${vscodeUI.url}?tkn=${vscodeUI.token}&payload=${JSON.stringify(vscodeUI.payload)}&folder=${
                uriFolder.path
            }`,
            {}
        )

        if (vscodeUI.extensionHostDebugPort) {
            await page.evaluate(
                debugPort => {
                    // insert a div right at the top that shows the debug port
                    const div = document.createElement('div')
                    Object.assign(div.style, {
                        position: 'fixed',
                        top: '0px',
                        left: '0px',
                        'background-color': '#fef08a',
                        color: '#78350f',
                        display: 'flex',
                        'z-index': 9999,
                        height: '35px',
                        'justify-content': 'center',
                        'align-items': 'center',
                        padding: '0 10px',
                    })
                    div.innerText = `Debug port: ${debugPort}`
                    document.body.appendChild(div)
                },
                [vscodeUI.extensionHostDebugPort]
            )
        }

        // wait for the UI to be ready
        //TODO: Allow stretching this is we're waiting for a debugger to connect
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

async function testUtilsInitScript() {
    //only run in the main frame
    if (window && window.self === window.top) {
        //@ts-ignore
        window.__testUtils = {
            cody: {
                getGlobalState: async () => {
                    return JSON.parse(
                        //@ts-ignore
                        await window.__testUtils.vscode.indexDB.get(
                            'vscode-web-state-db-global',
                            'ItemTable',
                            'sourcegraph.cody-ai'
                        )
                    )
                },
            },
            vscode: {
                indexDB: {
                    get: (dbName: string, objectStore: string, key: string) => {
                        return new Promise((resolve, reject) => {
                            const request = indexedDB.open(dbName)
                            request.onsuccess = event => {
                                //@ts-ignore
                                const db: IDBDatabase = event.target?.result
                                const tx = db.transaction(objectStore, 'readonly')
                                const store = tx.objectStore(objectStore)
                                const request = store.get(key)
                                request.onsuccess = event => {
                                    //@ts-ignore
                                    resolve(event.target?.result)
                                }
                                request.onerror = event => {
                                    //@ts-ignore
                                    reject(event.target?.error)
                                }
                            }
                            request.onerror = event => {
                                //@ts-ignore
                                reject(event.target?.error)
                            }
                        })
                    },
                    put: async (dbName: string, objectStore: string, key: string, value: any) => {
                        const ensureDB = (
                            version: number | undefined = undefined
                        ): Promise<IDBDatabase> => {
                            return new Promise((resolve, reject) => {
                                const request = indexedDB.open(dbName, version)

                                request.onupgradeneeded = event => {
                                    //@ts-ignore
                                    const db: IDBDatabase = event.target.result
                                    db.createObjectStore(objectStore)
                                }

                                request.onsuccess = event => {
                                    //@ts-ignore
                                    const db: IDBDatabase = event.target.result
                                    if (!db.objectStoreNames.contains(objectStore)) {
                                        // bump the version
                                        ensureDB(db.version + 1)
                                            .then(resolve)
                                            .catch(reject)
                                    } else {
                                        resolve(db)
                                    }
                                }

                                request.onerror = (event: any) => {
                                    reject(event.target.errorCode)
                                }
                            })
                        }
                        const db = await ensureDB()
                        await new Promise((resolve, reject) => {
                            const transaction = db.transaction([objectStore], 'readwrite')
                            const store = transaction.objectStore(objectStore)
                            //TODO: Configurable overwrites

                            const putRequest = store.put(value, key) // this path is not OS specific
                            putRequest.onsuccess = () => {
                                resolve(void 0)
                            }
                            putRequest.onerror = (event: any) => {
                                reject(event.target.errorCode)
                            }
                        })
                    },
                },
            },
        }
    }
}
