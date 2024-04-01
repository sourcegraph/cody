import type { Meta, StoryObj } from '@storybook/react'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/cody-shared'

import { LoginSimplified } from './OnboardingExperiment'
import { VSCodeSidebar } from './storybook/VSCodeStoryDecorator'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const meta: Meta<typeof LoginSimplified> = {
    title: 'cody/Onboarding',
    component: LoginSimplified,
    decorators: [VSCodeSidebar],
}

export default meta

const vscodeAPI: VSCodeWrapper = {
    postMessage: () => {},
    onMessage: () => () => {},
    getState: () => ({}),
    setState: () => {},
}

export const Login: StoryObj<typeof LoginSimplified> = {
    render: () => (
        <LoginSimplified
            simplifiedLoginRedirect={() => {}}
            telemetryService={NOOP_TELEMETRY_SERVICE}
            uiKindIsWeb={false}
            vscodeAPI={vscodeAPI}
        />
    ),
}

export const LoginWeb: StoryObj<typeof LoginSimplified> = {
    render: () => (
        <LoginSimplified
            simplifiedLoginRedirect={() => {}}
            telemetryService={NOOP_TELEMETRY_SERVICE}
            uiKindIsWeb={true}
            vscodeAPI={vscodeAPI}
        />
    ),
}
