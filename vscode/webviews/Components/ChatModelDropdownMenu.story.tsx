import type { Meta, StoryObj } from '@storybook/react'

import { DOTCOM_URL, ModelProvider } from '@sourcegraph/cody-shared'

import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'

import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import { ChatModelDropdownMenu } from './ChatModelDropdownMenu'

const meta: Meta<typeof ChatModelDropdownMenu> = {
    title: 'cody/Chat Model Dropdown',
    component: ChatModelDropdownMenu,
    decorators: [VSCodeStandaloneComponent],
    args: {
        models: ModelProvider.getProviders(ModelUsage.Chat, true, String(DOTCOM_URL)),
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
