import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { Observable } from 'observable-fns'
import { Chat } from './Chat'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { FIXTURE_COMMANDS, makePromptsAPIWithData } from './components/promptList/fixtures'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Chat> = {
    title: 'cody/Chat',
    component: Chat,

    argTypes: {
        transcript: {
            name: 'Transcript fixture',
            options: Object.keys(FIXTURE_TRANSCRIPT),
            mapping: FIXTURE_TRANSCRIPT,
            control: { type: 'select' },
        },
    },
    args: {
        transcript: FIXTURE_TRANSCRIPT.simple2,
        messageInProgress: null,
        chatEnabled: true,
        vscodeAPI: {
            postMessage: () => {},
            onMessage: () => () => {},
        },
        isTranscriptError: false,
        setView: () => {},
    } satisfies React.ComponentProps<typeof Chat>,

    decorators: [VSCodeWebview],
}

export default meta

export const Default: StoryObj<typeof meta> = {}

export const Empty: StoryObj<typeof meta> = { args: { transcript: [] } }

export const EmptyWithPromptLibraryUnsupported: StoryObj<typeof meta> = {
    args: { transcript: [] },
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                prompts: makePromptsAPIWithData({
                    prompts: { type: 'unsupported' },
                    commands: FIXTURE_COMMANDS,
                }),
                evaluatedFeatureFlag: _flag => Observable.of(true),
            }}
        >
            <Chat {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}

export const EmptyWithNoPrompts: StoryObj<typeof meta> = {
    args: { transcript: [] },
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                prompts: makePromptsAPIWithData({
                    prompts: { type: 'results', results: [] },
                    commands: FIXTURE_COMMANDS,
                }),
                evaluatedFeatureFlag: _flag => Observable.of(true),
            }}
        >
            <Chat {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}

export const Disabled: StoryObj<typeof meta> = { args: { chatEnabled: false } }
