import type { Meta, StoryObj } from '@storybook/react'

import { Transcript } from './Transcript'
import { FIXTURE_TRANSCRIPT, FIXTURE_USER_ACCOUNT_INFO, transcriptFixture } from './fixtures'

import { RateLimitError, errorToChatError, ps } from '@sourcegraph/cody-shared'
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
    },
    args: {
        transcript: FIXTURE_TRANSCRIPT.simple,
        messageInProgress: null,
        feedbackButtonsOnSubmit: () => {},
        copyButtonOnSubmit: () => {},
        insertButtonOnSubmit: () => {},
        userInfo: FIXTURE_USER_ACCOUNT_INFO,
        postMessage: () => {},
    } satisfies ComponentProps<typeof Transcript>,

    decorators: [VSCodeWebview],
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

const SIMPLE_TRANSCRIPT = FIXTURE_TRANSCRIPT.simple

export const WaitingForContext: StoryObj<typeof meta> = {
    args: {
        transcript: [...SIMPLE_TRANSCRIPT, { speaker: 'human', text: ps`What color is the sky?` }],
        messageInProgress: { speaker: 'assistant' },
    },
}

export const WaitingForAssistantMessageWithContext: StoryObj<typeof meta> = {
    args: {
        transcript: transcriptFixture([
            ...SIMPLE_TRANSCRIPT,
            {
                speaker: 'human',
                text: ps`What color is the sky?'`,
                contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
            },
        ]),
        messageInProgress: { speaker: 'assistant', model: 'my-llm' },
    },
}

export const WaitingForAssistantMessageNoContext: StoryObj<typeof meta> = {
    args: {
        transcript: transcriptFixture([
            ...SIMPLE_TRANSCRIPT,
            {
                speaker: 'human',
                text: ps`What color is the sky?'`,
                contextFiles: [],
            },
        ]),
        messageInProgress: { speaker: 'assistant' },
    },
}

export const AssistantMessageInProgress: StoryObj<typeof meta> = {
    args: {
        transcript: transcriptFixture([
            ...SIMPLE_TRANSCRIPT,
            {
                speaker: 'human',
                text: ps`What color is the sky?'`,
                contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
            },
        ]),
        messageInProgress: {
            speaker: 'assistant',
            model: 'my-model',
            text: ps`The sky is `,
        },
    },
}

export const WithError: StoryObj<typeof meta> = {
    args: {
        transcript: transcriptFixture([
            ...SIMPLE_TRANSCRIPT,
            { speaker: 'human', text: ps`What color is the sky?'`, contextFiles: [] },
            { speaker: 'assistant', error: errorToChatError(new Error('some error')) },
        ]),
        isTranscriptError: true,
    },
}

export const WithRateLimitError: StoryObj<typeof meta> = {
    args: {
        transcript: transcriptFixture([
            ...SIMPLE_TRANSCRIPT,
            { speaker: 'human', text: ps`What color is the sky?'`, contextFiles: [] },
            {
                speaker: 'assistant',
                error: errorToChatError(
                    new RateLimitError('chat messages and commands', 'rate limit error', true)
                ),
            },
        ]),
        isTranscriptError: true,
    },
}

export const TextWrapping: StoryObj<typeof meta> = {
    args: {
        transcript: transcriptFixture([
            ...SIMPLE_TRANSCRIPT,
            {
                speaker: 'human',
                text: ps`What color is the skyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskyskysky?`,
                contextFiles: [],
            },
            {
                speaker: 'assistant',
                text: ps`The sky is blueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblue.\n\n\`\`\`\nconst color = 'blueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblue'\n\`\`\`\n\nMore info:\n\n- Color of sky: blueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblueblue`,
            },
        ]),
        isTranscriptError: true,
    },
}
