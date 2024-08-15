import type { Meta, StoryObj } from '@storybook/react'

import { CodyIDE } from '@sourcegraph/cody-shared'
import { LoginSimplified } from './OnboardingExperiment'
import { VSCodeSidebar } from './storybook/VSCodeStoryDecorator'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const vscodeAPI: VSCodeWrapper = {
    postMessage: () => {},
    onMessage: () => () => {},
    getState: () => ({}),
    setState: () => {},
}

const meta: Meta<typeof LoginSimplified> = {
    title: 'cody/Onboarding',
    component: LoginSimplified,
    decorators: [VSCodeSidebar],
    args: {
        simplifiedLoginRedirect: () => {},
        uiKindIsWeb: false,
        vscodeAPI: vscodeAPI,
        codyIDE: CodyIDE.VSCode,
    },
}

export default meta

type Story = StoryObj<typeof LoginSimplified>

export const Login: Story = {
    args: {
        uiKindIsWeb: false,
        codyIDE: CodyIDE.VSCode,
    },
}

export const LoginWeb: StoryObj<typeof LoginSimplified> = {
    args: {
        uiKindIsWeb: true,
        codyIDE: CodyIDE.Web,
    },
}
