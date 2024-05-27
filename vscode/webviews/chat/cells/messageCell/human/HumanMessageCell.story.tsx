import type { Meta, StoryObj } from '@storybook/react'

import { PromptString } from '@sourcegraph/cody-shared'
import { VSCodeCell } from '../../../../storybook/VSCodeStoryDecorator'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO } from '../../../fixtures'
import { HumanMessageCell } from './HumanMessageCell'

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

export const Scrolling: StoryObj<typeof meta> = {
    args: {
        message: {
            speaker: 'human',
            text: PromptString.unsafe_fromUserQuery(
                new Array(100)
                    .fill(0)
                    .map(
                        (_, index) =>
                            `Line ${index} ${
                                index % 5 === 0
                                    ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
                                    : ''
                            }`
                    )
                    .join('\n')
            ),
        },
    },
}
