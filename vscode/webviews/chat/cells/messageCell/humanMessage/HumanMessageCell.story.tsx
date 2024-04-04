import type { Meta, StoryObj } from '@storybook/react'

import { HumanMessageCell } from './HumanMessageCell'

import type { ComponentProps } from 'react'
import { VSCodeWebview } from '../../../../storybook/VSCodeStoryDecorator'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO } from '../../../fixtures'

const meta: Meta<typeof HumanMessageCell> = {
    title: 'ui/HumanMessageCell',
    component: HumanMessageCell,

    args: {
        message: null,
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        isFirstMessage: true,
        onSubmit: () => {},
    } satisfies ComponentProps<typeof HumanMessageCell>,

    decorators: [VSCodeWebview],
}

export default meta

export const Empty: StoryObj<typeof meta> = {
    args: {},
}

export const WithText: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
    },
}

export const AlwaysShowToolbar: StoryObj<typeof meta> = {
    args: {
        message: FIXTURE_TRANSCRIPT.explainCode2[0],
        __storybook__alwaysShowToolbar: true,
    },
}
