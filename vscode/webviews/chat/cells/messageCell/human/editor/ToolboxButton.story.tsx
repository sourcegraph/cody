import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../../../storybook/VSCodeStoryDecorator'
import { ToolboxButton } from './ToolboxButton'

const meta: Meta<typeof ToolboxButton> = {
    title: 'cody/ToolboxButton',
    component: ToolboxButton,
    decorators: [VSCodeStandaloneComponent],
}

export default meta

type Story = StoryObj<typeof ToolboxButton>

export const Default: Story = {
    args: {
        settings: {
            agent: {
                name: 'deep-cody',
            },
        },
    },
}

export const AgentDisabled: Story = {
    args: {
        settings: {
            agent: {
                name: undefined,
            },
            shell: {
                enabled: false,
            },
        },
    },
}

export const FullyEnabled: Story = {
    args: {
        settings: {
            agent: {
                name: 'deep-cody',
            },
            shell: {
                enabled: true,
            },
        },
    },
}

export const ShellNotSupported: Story = {
    args: {
        settings: {
            agent: {
                name: 'deep-cody',
            },
            shell: {
                enabled: false,
                error: 'Terminal access is not enabled on either instance or client.',
            },
        },
    },
}

export const NonFirstMessage: Story = {
    args: {
        settings: {
            agent: {
                name: 'deep-cody',
            },
            shell: {
                enabled: true,
            },
        },
    },
}
