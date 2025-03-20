import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
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
        item: {
            uri: URI.parse(''),
            type: 'tool-state',
            outputType: 'status',
            status: UIToolStatus.Info,
            title: 'Process Output',
            content: 'This is the default output content',
            toolId: 'status-default',
            toolName: 'status',
        } as ContextItemToolState,
        defaultOpen: false,
    },
}

export const Info: Story = {
    args: {
        item: {
            uri: URI.parse(''),
            type: 'tool-state',
            outputType: 'status',
            status: UIToolStatus.Info,
            title: 'Process Output',
            content: 'This is the default output content',
            toolId: 'status-info',
            toolName: 'status',
        } as ContextItemToolState,
        defaultOpen: true,
    },
}

export const Success: Story = {
    args: {
        item: {
            uri: URI.parse(''),
            type: 'tool-state',
            outputType: 'status',
            status: UIToolStatus.Done,
            title: 'Task Completed',
            content: 'Successfully executed the requested task',
            toolId: 'status-success',
            toolName: 'status',
        } as ContextItemToolState,
    },
}

export const Fail: Story = {
    args: {
        item: {
            uri: URI.parse(''),
            type: 'tool-state',
            outputType: 'status',
            status: UIToolStatus.Error,
            title: 'Command Failed',
            content: 'Error: Unable to execute command due to missing permissions',
            toolId: 'status-fail',
            toolName: 'status',
        } as ContextItemToolState,
    },
}

export const Collapsed: Story = {
    args: {
        item: {
            uri: URI.parse(''),
            type: 'tool-state',
            outputType: 'status',
            status: UIToolStatus.Info,
            title: 'Collapsed Output',
            content: 'This content is collapsed by default',
            toolId: 'status-collapsed',
            toolName: 'status',
        } as ContextItemToolState,
        defaultOpen: false,
    },
}

export const WithoutOutput: Story = {
    args: {
        item: {
            uri: URI.parse(''),
            type: 'tool-state',
            outputType: 'status',
            status: UIToolStatus.Info,
            title: 'Empty Output',
            toolId: 'status-empty',
            toolName: 'status',
        } as ContextItemToolState,
    },
}

export const WithCustomClass: Story = {
    args: {
        item: {
            uri: URI.parse(''),
            type: 'tool-state',
            outputType: 'status',
            status: UIToolStatus.Info,
            title: 'Custom Styled Output',
            content: 'This output has custom styling',
            toolId: 'status-custom',
            toolName: 'status',
        } as ContextItemToolState,
        className: 'tw-max-w-md',
    },
}
