import path from 'node:path'
import type { Page } from 'playwright'
import { loggedV2Events } from '../fixtures/mock-server'
import { focusSidebar, sidebarSignin } from './common'
import { expect, getCodySidebar, test } from './helpers'

test('uninstall extension', async ({ openVSCode }) => {
    test.setTimeout(600000)
    // In order to trigger the uninstall event, we need to actually install the extension
    // into the local vscode instance
    const customExtensionVSIX = path.join(process.cwd(), 'dist', 'cody.e2e.vsix')
    let app = await openVSCode({
        installExtensions: [customExtensionVSIX],
        skipLocalInstall: true,
    })
    let page = await app.firstWindow()
    await signin(page)
    await app.close()

    // Now we uninstall the extension, and re-open VSCode. This will trigger the
    // vscode:uninstall event which will trigger telemetry events and set a marker
    // that the app has been uninstalled
    app = await openVSCode({
        uninstallExtensions: [customExtensionVSIX],
        skipLocalInstall: true,
    })
    // Allow the uninstaller to finish
    try {
        await expect(loggedV2Events).toContainEvents(['cody.extension:uninstalled'], { timeout: 5000 })
    } catch (error) {
        await sleep(100000)
    }
    await app.close()

    // Finally, we re-install the extension, and re-open VSCode. This will trigger the
    // the reinstall flow which will trigger telemetry events but will clear out secret storage
    app = await openVSCode({
        installExtensions: [customExtensionVSIX],
        skipLocalInstall: true,
    })
    page = await app.firstWindow()

    // This will fail if the credentials are saved because the login screen will still be
    // visible, thus it acts as an implicit test that credentials were cleared out
    await signin(page)
    try {
        await expect(loggedV2Events).toContainEvents(['cody.extension:reinstalled'], { timeout: 5000 })
    } catch (error) {
        await sleep(100000)
    }
})

async function signin(page: Page): Promise<void> {
    await focusSidebar(page)
    const sidebar = await getCodySidebar(page)
    await sidebarSignin(page, sidebar)
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
