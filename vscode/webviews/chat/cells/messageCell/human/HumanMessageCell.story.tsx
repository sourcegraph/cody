import type { Meta, StoryObj } from '@storybook/react'

import { HumanMessageCell } from './HumanMessageCell'

import { VSCodeCell } from '../../../../storybook/VSCodeStoryDecorator'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO } from '../../../fixtures'

const meta: Meta<typeof HumanMessageCell> = {
    title: 'ui/HumanMessageCell',
    component: HumanMessageCell,

    args: {
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        onSubmit: () => {},
    },

    decorators: [VSCodeCell],
}

export default meta

export const NonEmptyFirstMessage: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
        __storybook__focus: true,
    },
}

export const EmptyFollowup: StoryObj<typeof meta> = {
    args: {
        message: null,
        __storybook__focus: true,
    },
}

export const SentPending: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
        isSent: true,
        isPendingResponse: true,
        __storybook__focus: true,
    },
}

export const SentComplete: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
        isSent: true,
    },
}
