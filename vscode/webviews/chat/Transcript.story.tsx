import type { Meta, StoryObj } from '@storybook/react'

import { Transcript } from './Transcript'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO } from './fixtures'

import { RateLimitError, errorToChatError } from '@sourcegraph/cody-shared'
import type { ComponentProps } from 'react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Transcript> = {
    title: 'ui/Transcript',
    component: Transcript,

    argTypes: {
        transcript: {
            name: 'Transcript fixture',
            options: Object.keys(FIXTURE_TRANSCRIPT),
            mapping: FIXTURE_TRANSCRIPT,
            control: { type: 'select' },
        },
        messageBeingEdited: {
            name: 'messageBeingEdited',
            control: { type: 'number', step: 2 },
        },
    },
    args: {
        transcript: FIXTURE_TRANSCRIPT.simple,
        messageInProgress: null,
        messageBeingEdited: undefined,
        setMessageBeingEdited: () => {},
        feedbackButtonsOnSubmit: () => {},
        copyButtonOnSubmit: () => {},
        insertButtonOnSubmit: () => {},
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        postMessage: () => {},
    } satisfies ComponentProps<typeof Transcript>,

    decorators: [
        story => <div style={{ minHeight: 'max(500px, 80vh)', display: 'flex' }}>{story()}</div>,
        VSCodeWebview,
    ],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    args: {},
}

export const Empty: StoryObj<typeof meta> = {
    args: {
        transcript: [],
    },
}

export const WithContext: StoryObj<typeof meta> = {
    args: {
        transcript: FIXTURE_TRANSCRIPT.explainCode2,
    },
}

export const Editing: StoryObj<typeof meta> = {
    args: {
        messageBeingEdited: 0,
    },
}

export const EditingWithContext: StoryObj<typeof meta> = {
    args: {
        messageBeingEdited: 0,
        transcript: FIXTURE_TRANSCRIPT.explainCode2,
    },
}

const SIMPLE_TRANSCRIPT = FIXTURE_TRANSCRIPT.simple

export const WaitingForContext: StoryObj<typeof meta> = {
    args: {
        transcript: [...SIMPLE_TRANSCRIPT, { speaker: 'human', text: 'What color is the sky?' }],
        messageInProgress: { speaker: 'assistant' },
    },
}

export const WaitingForAssistantMessageWithContext: StoryObj<typeof meta> = {
    args: {
        transcript: [
            ...SIMPLE_TRANSCRIPT,
            {
                speaker: 'human',
                text: 'What color is the sky?',
                contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
            },
        ],
        messageInProgress: { speaker: 'assistant' },
    },
}

export const WaitingForAssistantMessageNoContext: StoryObj<typeof meta> = {
    args: {
        transcript: [
            ...SIMPLE_TRANSCRIPT,
            {
                speaker: 'human',
                text: 'What color is the sky?',
                contextFiles: [],
            },
        ],
        messageInProgress: { speaker: 'assistant' },
    },
}

export const AssistantMessageInProgress: StoryObj<typeof meta> = {
    args: {
        transcript: [
            ...SIMPLE_TRANSCRIPT,
            {
                speaker: 'human',
                text: 'What color is the sky?',
                contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
            },
        ],
        messageInProgress: {
            speaker: 'assistant',
            text: 'The sky is ',
        },
    },
}

export const WithError: StoryObj<typeof meta> = {
    args: {
        transcript: [
            ...SIMPLE_TRANSCRIPT,
            { speaker: 'human', text: 'What color is the sky?', contextFiles: [] },
            { speaker: 'assistant', error: errorToChatError(new Error('some error')) },
        ],
        isTranscriptError: true,
    },
}

export const WithRateLimitError: StoryObj<typeof meta> = {
    args: {
        transcript: [
            ...SIMPLE_TRANSCRIPT,
            { speaker: 'human', text: 'What color is the sky?', contextFiles: [] },
            {
                speaker: 'assistant',
                error: errorToChatError(
                    new RateLimitError('chat messages and commands', 'rate limit error', true)
                ),
            },
        ],
        isTranscriptError: true,
    },
}
