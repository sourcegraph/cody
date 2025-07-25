import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { TelemetryRecorderContext } from '../utils/telemetry'
import { Notices } from './Notices'

const meta: Meta<typeof Notices> = {
    title: 'cody/Notices',
    component: props => (
        <TelemetryRecorderContext.Provider value={{ recordEvent: () => {} }}>
            <ExtensionAPIProviderForTestsOnly value={MOCK_API}>
                <Notices {...props} />
            </ExtensionAPIProviderForTestsOnly>
        </TelemetryRecorderContext.Provider>
    ),
    parameters: {
        layout: 'centered',
    },
}

export default meta

type Story = StoryObj<typeof Notices>

export const SgTeammateNotice: Story = {
    args: {
        instanceNotices: [],
    },
}

export const NoNotices: Story = {
    args: {
        instanceNotices: [],
    },
}

export const WebUserNoNotices: Story = {
    args: {
        instanceNotices: [],
    },
}
