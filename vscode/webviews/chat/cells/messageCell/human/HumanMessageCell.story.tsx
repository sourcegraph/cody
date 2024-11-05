import type { Meta, StoryObj } from '@storybook/react'

import { PromptString, ps } from '@sourcegraph/cody-shared'
import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import { Observable } from 'observable-fns'
import { URI } from 'vscode-uri'
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

export const WithInitialContext: StoryObj<typeof meta> = {
    render: props => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                chatModels: () => Observable.of([]),
                defaultContext: () =>
                    Observable.of({
                        initialContext: [
                            {
                                type: 'repository',
                                uri: URI.parse('https://example.com/foo/myrepo'),
                                title: 'foo/myrepo',
                                repoName: 'foo/myrepo',
                                repoID: 'abcd',
                                content: null,
                            },
                            { type: 'file', uri: URI.file('/foo.js') },
                        ],
                        corpusContext: [],
                    }),
            }}
        >
            <HumanMessageCell {...props} />
        </ExtensionAPIProviderForTestsOnly>
    ),
    args: {
        message: { speaker: 'human', text: ps`` },
        isFirstMessage: true,
    },
}

export const WithInitialContextFileTooLarge: StoryObj<typeof meta> = {
    render: props => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                chatModels: () => Observable.of([]),
                defaultContext: () =>
                    Observable.of({
                        initialContext: [
                            {
                                type: 'repository',
                                uri: URI.parse('https://example.com/foo/myrepo'),
                                title: 'foo/myrepo',
                                repoName: 'foo/myrepo',
                                repoID: 'abcd',
                                content: null,
                            },
                            { type: 'file', isTooLarge: true, uri: URI.file('/large_file.js') },
                        ],
                        corpusContext: [],
                    }),
            }}
        >
            <HumanMessageCell {...props} />
        </ExtensionAPIProviderForTestsOnly>
    ),
    args: {
        message: { speaker: 'human', text: ps`` },
        isFirstMessage: true,
    },
}
