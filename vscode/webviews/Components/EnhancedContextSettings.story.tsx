import { useArgs, useState } from '@storybook/preview-api'
import { type Meta, type StoryObj } from '@storybook/react'

import { type ContextProvider, type LocalEmbeddingsProvider, type SearchProvider } from '@sourcegraph/cody-shared'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import {
    EnhancedContextContext,
    EnhancedContextEventHandlers,
    EnhancedContextSettings,
    type EnhancedContextEventHandlersT,
} from './EnhancedContextSettings'

const meta: Meta<typeof EnhancedContextSettings> = {
    title: 'cody/Enhanced Context',
    component: EnhancedContextSettings,
    decorators: [VSCodeStoryDecorator],
    parameters: {
        backgrounds: {
            default: 'vscode',
            values: [
                {
                    name: 'vscode',
                    value: 'var(--vscode-sideBar-background)',
                },
            ],
        },
    },
}

export default meta

interface SingleTileArgs {
    isOpen: boolean
    name: string
    kind: 'embeddings' | 'graph' | 'search'
    type: 'local'
    state: 'indeterminate' | 'unconsented' | 'indexing' | 'ready' | 'no-match'
}

export const SingleTile: StoryObj<typeof EnhancedContextSettings | SingleTileArgs> = {
    args: {
        isOpen: true,
        name: '~/sourcegraph',
        kind: 'embeddings',
        type: 'local',
        state: 'ready',
    },
    argTypes: {
        isOpen: { control: 'boolean' },
        name: { control: 'text' },
        kind: {
            options: ['embeddings', 'graph', 'search'],
            control: 'select',
        },
        type: {
            options: ['local'],
            control: 'select',
            if: {
                arg: 'kind',
                eq: 'embeddings',
            },
        },
        state: {
            options: ['indeterminate', 'unconsented', 'indexing', 'ready', 'no-match'],
            control: 'select',
        },
    },
    render: function Render() {
        const [args, updateArgs] = useArgs<SingleTileArgs>()
        const [isOpen, setIsOpen] = useState<boolean>(args.isOpen)

        const eventHandlers: EnhancedContextEventHandlersT = {
            onConsentToEmbeddings(provider: LocalEmbeddingsProvider): void {
                updateArgs({ state: 'indexing' })
            },
            onShouldBuildSymfIndex(provider: SearchProvider): void {
                updateArgs({ state: 'indexing' })
            },
            onEnabledChange(enabled: boolean): void {
                console.log(`Thank you for ${enabled ? 'enabling' : 'disabling'} the enhanced context!`)
            },
        }

        return (
            <EnhancedContextContext.Provider
                value={{
                    groups: [
                        {
                            name: args.name,
                            providers: [
                                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                                {
                                    kind: args.kind,
                                    type: args.type,
                                    state: args.state,
                                } as ContextProvider,
                            ],
                        },
                    ],
                }}
            >
                <EnhancedContextEventHandlers.Provider value={eventHandlers}>
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 20,
                            right: 20,
                        }}
                    >
                        <EnhancedContextSettings isOpen={isOpen} setOpen={() => setIsOpen(!isOpen)} />
                    </div>
                </EnhancedContextEventHandlers.Provider>
            </EnhancedContextContext.Provider>
        )
    },
}

export const Smorgasbord: StoryObj<typeof EnhancedContextSettings> = {
    render: function Render() {
        const [isOpen, setIsOpen] = useState<boolean>(true)
        return (
            <EnhancedContextContext.Provider
                value={{
                    groups: [
                        {
                            name: '~/projects/foo',
                            providers: [
                                { kind: 'embeddings', type: 'local', state: 'unconsented' },
                                { kind: 'graph', state: 'ready' },
                                { kind: 'search', state: 'indexing' },
                            ],
                        },
                        {
                            name: 'gitlab.com/my/repo',
                            providers: [
                                {
                                    kind: 'embeddings',
                                    type: 'local',
                                    state: 'ready',
                                },
                            ],
                        },
                        {
                            name: 'github.com/sourcegraph/bar',
                            providers: [
                                {
                                    kind: 'embeddings',
                                    type: 'local',
                                    state: 'no-match',
                                },
                            ],
                        },
                    ],
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        bottom: 20,
                        right: 20,
                    }}
                >
                    <EnhancedContextSettings isOpen={isOpen} setOpen={() => setIsOpen(!isOpen)} />
                </div>
            </EnhancedContextContext.Provider>
        )
    },
}
