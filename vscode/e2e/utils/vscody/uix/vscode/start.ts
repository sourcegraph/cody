import path from 'node:path'
import URL from 'node:url'
import { test as t } from '@playwright/test'
import { URI } from 'vscode-uri'
import type { UIXContextFnContext } from '..'

export async function start({
    vscodeUI,
    page,
    workspaceDir,
}: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'workspaceDir'>) {
    const interceptRouteURL = `${URL.resolve(vscodeUI.url, '/**')}`
    return t.step(
        'Start VSCode Session',
        async () => {
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
                                //@ts-ignore
                                executeCommand: (cmd, ...args) =>
                                    code.commands.executeCommand(cmd, args),
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
                `${vscodeUI.url}?tkn=${vscodeUI.token}&payload=${JSON.stringify(
                    vscodeUI.payload
                )}&folder=${uriFolder.path}`,
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
        },
        {
            box: true,
        }
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
