import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'

import { Notices } from './index'

const meta: Meta = {
    title: 'cody/Notices',
    component: Notices,
    decorators: [
        story => {
            localStorage.removeItem('notices.last-dismissed-version')
            return story()
        },
        VSCodeStandaloneComponent,
    ],
    args: { probablyNewInstall: false, vscodeAPI: { onMessage: () => {} } },
}

export default meta

type Story = StoryObj

export const Default: Story = {}
