import path from 'node:path'
import type { Page } from 'playwright'
import { loggedV2Events } from '../fixtures/mock-server'
import { expectAuthenticated, focusSidebar, sidebarSignin } from './common'
import { expect, getCodySidebar, test } from './helpers'

test('uninstall extension', async ({ openVSCode }) => {
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
    await expect(loggedV2Events.map(e => e.testId)).toContainEvents(['cody.extension:uninstalled'], {
        timeout: 5000,
    })
    await app.close()

    // we re-install the extension, and re-open VSCode. This will trigger the
    // the reinstall flow which will trigger telemetry events but will clear out secret storage
    app = await openVSCode({
        installExtensions: [customExtensionVSIX],
        skipLocalInstall: true,
    })
    page = await app.firstWindow()

    // This will fail if the credentials are saved because the login screen will still be
    // visible, thus it acts as an implicit test that credentials were cleared out
    await signin(page)
    await expect(loggedV2Events.map(e => e.testId)).toContainEvents(['cody.extension:reinstalled'], {
        timeout: 5000,
    })
    await app.close()

    // Finally, re-open the VSCode and ensure that we are still logged in
    app = await openVSCode({
        skipLocalInstall: true,
    })
    page = await app.firstWindow()
    await expectAuthenticated(page)
})

async function signin(page: Page): Promise<void> {
    await focusSidebar(page)
    const sidebar = await getCodySidebar(page)
    await sidebarSignin(page, sidebar)
}
