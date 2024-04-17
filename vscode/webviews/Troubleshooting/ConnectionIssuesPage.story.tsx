import type { Meta, StoryObj } from '@storybook/react'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/cody-shared'
// import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/cody-shared'
import { VSCodeViewport } from '../storybook/VSCodeStoryDecorator'
// import type { VSCodeWrapper } from '../utils/VSCodeApi'
import { ConnectionIssuesPage } from './ConnectionIssuesPage'

const meta: Meta<typeof ConnectionIssuesPage> = {
    title: 'cody/Troubleshooting',
    component: ConnectionIssuesPage,
    decorators: [VSCodeViewport()],
    parameters: {
        layout: 'fullscreen',
    },
    args: {
        configuredEndpoint: 'https://sourcegraph.sourcegraph.com',
        vscodeAPI: {
            postMessage: () => {},
        },
        telemetryService: NOOP_TELEMETRY_SERVICE,
    },
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {}
