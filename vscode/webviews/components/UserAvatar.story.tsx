import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'

import { UserAvatar } from './UserAvatar'

const meta: Meta<typeof UserAvatar> = {
    title: 'cody/UserAvatar',
    component: UserAvatar,
    decorators: [story => <div className="tw-m-5">{story()}</div>, VSCodeStandaloneComponent],
    args: {
        size: 30,
    },
}

export default meta

type Story = StoryObj<typeof UserAvatar>

export const Image: Story = {
    args: {
        user: {
            username: 'sqs',
            avatarURL: 'https://avatars.githubusercontent.com/u/1976',
            endpoint: '',
        },
    },
}

export const Text1Letter: Story = {
    args: {
        user: {
            username: 'sqs',
            endpoint: '',
        },
    },
}

export const Text2Letters: Story = {
    args: {
        user: {
            username: 'sqs',
            displayName: 'Quinn Slack',
            endpoint: '',
        },
    },
}

export const SourcegraphGradientBorder: Story = {
    args: {
        user: {
            username: 'sqs',
            avatarURL: 'https://avatars.githubusercontent.com/u/1976',
            endpoint: '',
        },
        sourcegraphGradientBorder: true,
    },
}
