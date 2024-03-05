import type { Meta, StoryObj } from '@storybook/react'

import { DOTCOM_URL, ModelProvider } from '@sourcegraph/cody-shared'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import { ChatModelDropdownMenu } from './ChatModelDropdownMenu'

const meta: Meta<typeof ChatModelDropdownMenu> = {
    title: 'cody/Chat Model Dropdown',
    component: ChatModelDropdownMenu,
    decorators: [VSCodeStoryDecorator],
    args: {
        models: ModelProvider.get(ModelUsage.Chat, String(DOTCOM_URL)),
        disabled: false,
    },
    parameters: {
        backgrounds: {
            default: 'vscode',
            values: [
                {
                    name: 'vscode',
                    value: 'var(--vscode-sideBar-background)',
                },
            ],
        },
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
