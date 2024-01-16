import { type Meta, type StoryObj } from '@storybook/react'

import { ChatModelProvider, DOTCOM_URL } from '@sourcegraph/cody-shared'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { ChatModelDropdownMenu } from './ChatModelDropdownMenu'

const meta: Meta<typeof ChatModelDropdownMenu> = {
    title: 'cody/Chat Model Dropdown',
    component: ChatModelDropdownMenu,
    decorators: [VSCodeStoryDecorator],
    args: {
        models: ChatModelProvider.get(String(DOTCOM_URL)),
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
