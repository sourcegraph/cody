import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { Observable } from 'observable-fns'
import { Chat } from './Chat'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { FIXTURE_COMMANDS, makePromptsAPIWithData } from './components/promptList/fixtures'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import { ChatSessionProvider } from './utils/useChatSession'

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
        setView: () => {},
    } satisfies React.ComponentProps<typeof Chat>,

    decorators: [VSCodeWebview],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    render: args => (
        <ChatSessionProvider>
            <Chat {...args} />
        </ChatSessionProvider>
    ),
}

export const Empty: StoryObj<typeof meta> = {
    args: { transcript: [] },
    render: args => (
        <ChatSessionProvider>
            <Chat {...args} />
        </ChatSessionProvider>
    ),
}

export const EmptyWithPromptLibraryUnsupported: StoryObj<typeof meta> = {
    args: { transcript: [] },
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                prompts: makePromptsAPIWithData({
                    arePromptsSupported: false,
                    prompts: [],
                    commands: FIXTURE_COMMANDS,
                }),
                evaluatedFeatureFlag: _flag => Observable.of(true),
            }}
        >
            <ChatSessionProvider>
                <Chat {...args} />
            </ChatSessionProvider>
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
                    prompts: [],
                    commands: FIXTURE_COMMANDS,
                }),
                evaluatedFeatureFlag: _flag => Observable.of(true),
            }}
        >
            <ChatSessionProvider>
                <Chat {...args} />
            </ChatSessionProvider>
        </ExtensionAPIProviderForTestsOnly>
    ),
}

export const Disabled: StoryObj<typeof meta> = { args: { chatEnabled: false } }
