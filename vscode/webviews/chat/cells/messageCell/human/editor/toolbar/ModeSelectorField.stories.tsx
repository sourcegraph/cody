import type { Meta, StoryObj } from '@storybook/react'
import { ModeSelectorField } from './ModeSelectorButton'

const meta: Meta<typeof ModeSelectorField> = {
    title: 'Chat/ModeSelectorField',
    component: ModeSelectorField,
    parameters: {
        layout: 'centered',
    },
    args: {
        omniBoxEnabled: true,
        isDotComUser: false,
        isCodyProUser: true,
        _intent: 'chat',
        manuallySelectIntent: () => {},
    },
}

export default meta

type Story = StoryObj<typeof ModeSelectorField>

export const Default: Story = {}

export const WithSearchSelected: Story = {
    args: {
        _intent: 'search',
    },
}

export const WithAgenticSelected: Story = {
    args: {
        _intent: 'agentic',
    },
}

export const DotComUser: Story = {
    args: {
        isDotComUser: true,
        isCodyProUser: false,
    },
}

export const WithoutOmniBox: Story = {
    args: {
        omniBoxEnabled: false,
    },
}
