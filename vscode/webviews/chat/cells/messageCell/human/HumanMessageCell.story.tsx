import type { Meta, StoryObj } from '@storybook/react'

import { PromptString } from '@sourcegraph/cody-shared'
import { VSCodeCell } from '../../../../storybook/VSCodeStoryDecorator'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO } from '../../../fixtures'
import { HumanMessageCell } from './HumanMessageCell'

const meta: Meta<typeof HumanMessageCell> = {
    title: 'ui/HumanMessageCell',
    component: HumanMessageCell,

    args: {
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        chatEnabled: true,
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

export const SentComplete: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
        isSent: true,
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
