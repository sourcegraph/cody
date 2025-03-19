import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { OutputStatusCell } from './OutputStatusCell'

const meta: Meta<typeof OutputStatusCell> = {
    title: 'agentic/OutputStatusCell',
    component: OutputStatusCell,
    decorators: [VSCodeWebview],
}

export default meta

type Story = StoryObj<typeof OutputStatusCell>

export const Default: Story = {
    args: {
        output: {
            type: 'status',
            status: UIToolStatus.Info,
            title: 'Process Output',
            content: 'This is the default output content',
        },
        defaultOpen: false,
    },
}

export const Info: Story = {
    args: {
        output: {
            type: 'status',
            status: UIToolStatus.Info,
            title: 'Process Output',
            content: 'This is the default output content',
        },
        defaultOpen: true,
    },
}

export const Success: Story = {
    args: {
        output: {
            type: 'status',
            status: UIToolStatus.Done,
            title: 'Task Completed',
            content: 'Successfully executed the requested task',
        },
    },
}

export const Fail: Story = {
    args: {
        output: {
            type: 'status',
            status: UIToolStatus.Error,
            title: 'Command Failed',
            content: 'Error: Unable to execute command due to missing permissions',
        },
    },
}

export const Collapsed: Story = {
    args: {
        defaultOpen: false,
    },
}

export const WithoutOutput: Story = {
    args: {},
}

export const WithCustomClass: Story = {
    args: {
        className: 'tw-max-w-md',
    },
}
