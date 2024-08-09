import { type TestDetails, expect } from '@playwright/test'
import { Annotations } from './utils/test-info'
import { fixture as test, uix } from './utils/vscody'
import { ChatConversation, type WebView } from './utils/vscody/uix/cody'
import { withFloorResponseTime } from './utils/vscody/uix/mitm'

const VERSION_UPDATE_STORAGE_KEY = 'notices.last-dismissed-version'
const UPDATE_TOAST_TEXT = /Cody updated to v\d+\.\d+/

const testDetails: TestDetails = {
    annotation: [{ type: Annotations.Feature, description: 'update notices' }],
}

test.describe('update notices', testDetails, () => {
    // Disable the test but keep the code around for when it's re-enabled.
    test.skip(
        true,
        'This is disabled because we temporarily disabled update notices: https://github.com/sourcegraph/cody/pull/5046'
    )
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })

    test('work as expected', async ({ workspaceDir, page, vscodeUI, executeCommand, mitmProxy }) => {
        let sidebar: WebView
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await uix.vscode.startSession({ page, vscodeUI, executeCommand, workspaceDir })
            await uix.cody.waitForStartup({ page })
            await executeCommand('workbench.view.extension.cody')
            sidebar = (await uix.cody.WebView.all({ page }, { atLeast: 1 }))[0]
        })

        await test.step('new installs should not show a toast', async () => {
            await sidebar.waitUntilReady()
            const updateNotice = sidebar.content.getByTestId('update-notice')
            await expect(updateNotice).not.toBeVisible()
        })

        let currentVersion: string
        await test.step('local storage saves the latest version', async () => {
            currentVersion = (await getVersion(sidebar)) as string
            expect(currentVersion).toMatch(/\d+\.\d+/)
        })

        // we create some interactions here so that we're no longer seen as a new installation.
        await test.step('engage with chat to no longer qualify as a new installation', async () => {
            const conversation = ChatConversation.get({ webview: sidebar })
            const message = conversation.userMessage(0)
            await message.textInput.click()
            await message.textInput.clear()
            await message.textInput.fill('respond with "hello world"')

            // We slow down network responses so we're guaranteed to be able to abort
            await withFloorResponseTime(500, { mitmProxy }, async () => {
                await message.submit()
                await message.abort()
            })
        })

        let editorChat: WebView
        await test.step('older versions should see a toast', async () => {
            await setVersion(sidebar, '0.7')
            // TODO: we don't currently check the value set here on show/hide of the sidebar
            // so instead we open a new chat in the editor.

            await executeCommand('cody.chat.newEditorPanel')

            editorChat = (await uix.cody.WebView.all({ page }, { atLeast: 1, ignoring: [sidebar] }))[0]

            await editorChat.waitUntilReady()
            const updateNotice = editorChat.content.getByTestId('update-notice')
            await expect(updateNotice).toBeVisible()
            await expect(updateNotice).toContainText(UPDATE_TOAST_TEXT)
        })

        await test.step('Dismissing the notice should update local storage', async () => {})
    })
})

function getVersion(sidebar: uix.cody.WebView): Promise<string | null> {
    return sidebar.content.locator(':root').evaluate(
        (_, { VERSION_UPDATE_STORAGE_KEY }) => {
            return localStorage.getItem(VERSION_UPDATE_STORAGE_KEY)
        },
        { VERSION_UPDATE_STORAGE_KEY }
    )
}

async function setVersion(sidebar: uix.cody.WebView, value: string): Promise<void> {
    const savedValue = await sidebar.content.locator(':root').evaluate(
        (_, { VERSION_UPDATE_STORAGE_KEY, value }) => {
            localStorage.setItem(VERSION_UPDATE_STORAGE_KEY, value)
            return localStorage.getItem(VERSION_UPDATE_STORAGE_KEY)
        },
        { VERSION_UPDATE_STORAGE_KEY, value }
    )
    expect(savedValue).toEqual(value)
}
