import type { Meta, StoryObj } from '@storybook/react'

import { CodyIDE } from '@sourcegraph/cody-shared'
import { AuthPage } from './AuthPage'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const vscodeAPI: VSCodeWrapper = {
    postMessage: () => {},
    onMessage: () => () => {},
    getState: () => ({}),
    setState: () => {},
}

const meta: Meta<typeof AuthPage> = {
    title: 'cody/AuthPage',
    component: AuthPage,
    decorators: [VSCodeWebview],
    args: {
        simplifiedLoginRedirect: () => {},
        uiKindIsWeb: false,
        vscodeAPI: vscodeAPI,
        codyIDE: CodyIDE.VSCode,
    },
}

export default meta

type Story = StoryObj<typeof AuthPage>

export const VSCodeDesktop: Story = {
    args: {
        uiKindIsWeb: false,
        codyIDE: CodyIDE.VSCode,
    },
}

export const VSCodeWeb: StoryObj<typeof AuthPage> = {
    args: {
        uiKindIsWeb: true,
        codyIDE: CodyIDE.VSCode,
    },
}

export const SourcegraphWeb: StoryObj<typeof AuthPage> = {
    args: {
        uiKindIsWeb: true,
        codyIDE: CodyIDE.Web,
    },
}

export const JetBrainsDesktop: StoryObj<typeof AuthPage> = {
    args: {
        uiKindIsWeb: false,
        codyIDE: CodyIDE.JetBrains,
    },
}
