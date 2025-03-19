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
        title: 'Process Output',
        status: 'info',
        content: 'This is the default output content',
        defaultOpen: false,
    },
}

export const Info: Story = {
    args: {
        title: 'Process Output',
        status: 'info',
        content: 'This is the default output content',
        defaultOpen: true,
    },
}

export const Success: Story = {
    args: {
        status: 'success',
        title: 'Task Completed',
        content: 'Successfully executed the requested task',
    },
}

export const Fail: Story = {
    args: {
        status: 'error',
        title: 'Command Failed',
        content: 'Error: Unable to execute command due to missing permissions',
    },
}

export const Warning: Story = {
    args: {
        status: 'warning',
        title: 'Potential Issue',
        content: 'The operation completed but with potential issues that might need attention',
    },
}

export const Collapsed: Story = {
    args: {
        defaultOpen: false,
    },
}

export const WithoutOutput: Story = {
    args: {
        content: undefined,
    },
}

export const WithCustomClass: Story = {
    args: {
        className: 'tw-max-w-md',
    },
}
