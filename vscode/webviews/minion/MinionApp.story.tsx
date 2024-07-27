import type { GenericVSCodeWrapper } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import type { MinionTranscriptItem } from '../../src/minion/action'
import { VSCodeWebview } from '../storybook/VSCodeStoryDecorator'
import { MinionApp } from './MinionApp'
import type { MinionExtensionMessage, MinionWebviewMessage } from './webview_protocol'

const meta: Meta<typeof MinionApp> = {
    title: 'cody/MinionApp',
    component: MinionApp,

    decorators: [VSCodeWebview],
}

export default meta

export const Simple: StoryObj<typeof meta> = {
    render: () => (
        <div style={{ height: '60em' }}>
            <MinionApp vscodeAPI={dummyVSCodeAPI} />
        </div>
    ),
}

const dummyVSCodeAPI: GenericVSCodeWrapper<MinionWebviewMessage, MinionExtensionMessage> = {
    onMessage: cb => {
        // Send initial message so that the component is fully rendered.
        cb({
            type: 'config',
            workspaceFolderUris: [],
        })
        cb({
            type: 'update-session-ids',
            sessionIds: ['existing-session-1', 'existing-session-2'],
        })

        const transcript: MinionTranscriptItem[] = []

        transcript.push({
            type: 'event',
            event: {
                level: 0,
                type: 'describe',
                description: 'This is the issue description',
            },
        })
        cb({ type: 'update-transcript', transcript: [...transcript] })

        transcript.push({
            type: 'block',
            block: { nodeid: 'restate', blockid: 'restate-0' },
            status: 'done',
        })
        cb({ type: 'update-transcript', transcript: [...transcript] })

        transcript.push({
            type: 'event',
            event: {
                level: 0,
                type: 'restate',
                output: 'This is the existing behavior.\n\nThis is the desired behavior.',
            },
        })
        cb({ type: 'update-transcript', transcript: [...transcript] })

        transcript.push({
            type: 'block',
            block: { nodeid: 'contextualize', blockid: 'contextualize-0' },
            status: 'done',
        })
        cb({ type: 'update-transcript', transcript: [...transcript] })

        transcript.push({
            type: 'event',
            event: {
                level: 0,
                type: 'contextualize',
                output: tsSnippets,
            },
        })
        cb({ type: 'update-transcript', transcript: [...transcript] })

        transcript.push({ type: 'block', block: { nodeid: 'plan', blockid: 'plan-0' }, status: 'doing' })
        cb({ type: 'update-transcript', transcript: [...transcript] })

        transcript.push({
            type: 'event',
            event: {
                level: 0,
                type: 'plan',
                blockid: 'plan-0',
                steps: [
                    {
                        stepId: 'step-1',
                        title: 'The first step',
                        description: 'This is the first step description',
                    },
                    {
                        stepId: 'step-2',
                        title: 'The second step',
                        description: 'This is the second step description',
                    },
                    {
                        stepId: 'step-3',
                        title: 'The third step',
                        description:
                            'Add a new ContextMentionProvider for the "svelte" trigger prefix that fetches content from "https://svelte.dev/docs/client-side-component-api". Add a new ContextMentionProvider for the "svelte" trigger prefix that fetches content from "https://svelte.dev/docs/client-side-component-api". Add a new ContextMentionProvider for the "svelte" trigger prefix that fetches content from "https://svelte.dev/docs/client-side-component-api". Add a new ContextMentionProvider for the "svelte" trigger prefix that fetches content from "https://svelte.dev/docs/client-side-component-api". ',
                    },
                ],
            },
        })
        cb({ type: 'update-transcript', transcript: [...transcript] })
        return () => {}
    },

    postMessage: (message: MinionWebviewMessage) => {
        console.log('Extension host mock received message', message)
    },
    getState: () => ({}),
    setState: () => {},
}

const tsSnippets = [
    {
        source: {
            uri: URI.file('/path/to/foobar.ts'),
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
            },
        },
        text: `
export type ActionL1 = { level: 1 } & (
    | {
            type: 'search'
            query: string
            results: string[]
        }
    | {
            type: 'open'
            file: string
        }
    | {
            type: 'scroll'
            direction: 'up' | 'down'
        }
    | {
            type: 'edit'
            file: string
            start: number
            end: number
            replacement: string
        }
    | {
            type: 'bash'
            command: string
            output: string
        }
    | {
            type: 'human'
            actionType: 'edit' | 'view'
            description: string
        }
)`.trimStart(),
        comment: '',
    },
]
