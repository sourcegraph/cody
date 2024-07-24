import fs from 'node:fs/promises'
import path from 'node:path'
import { test as t } from '@playwright/test'
import type { UIXContextFnContext } from '.'

type SidebarCtx = Pick<UIXContextFnContext, 'page'>
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
    executeCommand,
    workspaceDir,
}: Pick<UIXContextFnContext, 'page' | 'vscodeUI' | 'executeCommand' | 'workspaceDir'>) {
    // If we have a debugger then we show some user instructions
    const { extensionHostDebugPort } = vscodeUI
    if (extensionHostDebugPort) {
        await t.step('Show Debug Instructions', async () => {
            // load a landing page before the session is initialized
            const placeholderDir = path.join(__dirname, '../resources/vscode-placeholder')
            await page.route('http://vscode-pending.local/**', async (route, request) => {
                // serve local modified HTML or any of the resources requested
                if (request.url() === 'http://vscode-pending.local/') {
                    route.fulfill({
                        body: (
                            await fs.readFile(path.join(placeholderDir, 'index.html'), 'utf-8')
                        ).replaceAll('{{DEBUG_PORT}}', extensionHostDebugPort.toString()),
                        headers: {
                            'Content-Type': 'text/html',
                        },
                        status: 200,
                    })
                } else {
                    const pathParts = request
                        .url()
                        .replace('http://vscode-pending.local/', '')
                        .split('/')
                    route.fulfill({
                        path: path.join(placeholderDir, ...pathParts),
                    })
                }
            })
            await page.goto('http://vscode-pending.local/')
        })
    }
    return t.step('Start VSCode Session', async () => {
        // we dummy route here so that we can modify the state etc. Which would
        // otherwise be protected by the browser to match the domain
        await page.route(
            vscodeUI.url,
            route => {
                route.fulfill({
                    status: 200,
                    body: '',
                })
            },
            { times: 1 }
        )
        await page.goto(vscodeUI.url)
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
