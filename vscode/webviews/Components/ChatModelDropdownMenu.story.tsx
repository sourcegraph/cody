import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'

import { DEFAULT_DOT_COM_MODELS } from '@sourcegraph/cody-shared'
import { ChatModelDropdownMenu } from './ChatModelDropdownMenu'

const meta: Meta<typeof ChatModelDropdownMenu> = {
    title: 'cody/Chat Model Dropdown',
    component: ChatModelDropdownMenu,
    decorators: [VSCodeStandaloneComponent],
    args: {
        models: DEFAULT_DOT_COM_MODELS,
        disabled: false,
    },
}

export default meta

type Story = StoryObj<typeof ChatModelDropdownMenu>

export const FreeUser: Story = {
    args: {
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
    },
}

export const ProUser: Story = {
    args: {
        userInfo: {
            isDotComUser: true,
            isCodyProUser: true,
        },
    },
}
