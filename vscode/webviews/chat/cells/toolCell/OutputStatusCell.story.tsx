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
        result: 'This is the default output content',
        defaultOpen: false,
    },
}

export const Info: Story = {
    args: {
        title: 'Process Output',
        status: 'info',
        result: 'This is the default output content',
        defaultOpen: true,
    },
}

export const Success: Story = {
    args: {
        status: 'success',
        title: 'Task Completed',
        result: 'Successfully executed the requested task',
    },
}

export const Fail: Story = {
    args: {
        status: 'error',
        title: 'Command Failed',
        result: 'Error: Unable to execute command due to missing permissions',
    },
}

export const Warning: Story = {
    args: {
        status: 'warning',
        title: 'Potential Issue',
        result: 'The operation completed but with potential issues that might need attention',
    },
}

export const Collapsed: Story = {
    args: {
        defaultOpen: false,
    },
}

export const WithoutOutput: Story = {
    args: {
        result: undefined,
    },
}

export const WithCustomClass: Story = {
    args: {
        className: 'tw-max-w-md',
    },
}
