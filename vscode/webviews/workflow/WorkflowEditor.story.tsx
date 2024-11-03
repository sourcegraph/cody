import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeWebview } from '../storybook/VSCodeStoryDecorator'
import { WorkflowApp } from './WorkflowApp'

const meta: Meta<typeof WorkflowApp> = {
    title: 'cody/WorkflowEditor',
    component: WorkflowApp,
    decorators: [VSCodeWebview],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    render: () => (
        <div style={{ height: '100vh' }}>
            <WorkflowApp vscodeAPI={{
                postMessage: () => {},
                onMessage: () => () => {},
                getState: () => ({}),
                setState: () => {},
            }} />
        </div>
    ),
}
