import type { Meta, StoryObj } from '@storybook/react'

import { HumanMessageCell } from './HumanMessageCell'

import { VSCodeCell } from '../../../../storybook/VSCodeStoryDecorator'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO } from '../../../fixtures'

const meta: Meta<typeof HumanMessageCell> = {
    title: 'ui/HumanMessageCell',
    component: HumanMessageCell,

    args: {
        message: null,
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        onSubmit: () => {},
        __storybook__focus: false,
    },

    decorators: [VSCodeCell],
}

export default meta

export const FirstMessageEmpty: StoryObj<typeof meta> = {
    args: {
        isFirstMessage: true,
    },
}

export const FirstMessageWithText: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
        isFirstMessage: true,
    },
}

export const FollowupEmpty: StoryObj<typeof meta> = {
    args: {
        message: null,
        isFirstMessage: false,
    },
}

export const FollowupWithText: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
        isFirstMessage: false,
    },
}
