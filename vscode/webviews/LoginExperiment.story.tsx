import { Meta, StoryObj } from '@storybook/react'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/cody-shared/src/telemetry'

import { LoginSimplified } from './LoginExperiment'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof LoginSimplified> = {
    title: 'cody/LoginExperiment',
    component: LoginSimplified,
    decorators: [VSCodeStoryDecorator],
}

export default meta

export const Login: StoryObj<typeof LoginSimplified> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <LoginSimplified
                telemetryService={NOOP_TELEMETRY_SERVICE}
                simplifiedLoginRedirect={() => {}}
            />
        </div>
    ),
}
