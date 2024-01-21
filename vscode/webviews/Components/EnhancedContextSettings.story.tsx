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
    type: 'local' | 'remote'
    state: 'indeterminate' | 'unconsented' | 'indexing' | 'ready' | 'no-match'
    origin: string
    remoteName: string
}

export const SingleTile: StoryObj<typeof EnhancedContextSettings | SingleTileArgs> = {
    args: {
        isOpen: true,
        name: '~/sourcegraph',
        kind: 'embeddings',
        type: 'remote',
        state: 'ready',
        origin: 'https://sourcegraph.com',
        remoteName: 'github.com/sourcegraph/sourcegraph',
    },
    argTypes: {
        isOpen: { control: 'boolean' },
        name: { control: 'text' },
        kind: {
            options: ['embeddings', 'graph', 'search'],
            control: 'select',
        },
        type: {
            options: ['local', 'remote'],
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
        origin: { control: 'text' },
        remoteName: { control: 'text' },
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
                            displayName: args.name,
                            providers: [
                                {
                                    kind: args.kind,
                                    type: args.type,
                                    state: args.state,
                                    origin: args.origin,
                                    remoteName: args.remoteName,
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
                            displayName: '~/projects/foo',
                            providers: [
                                { kind: 'embeddings', type: 'local', state: 'unconsented' },
                                { kind: 'graph', state: 'ready' },
                                { kind: 'search', state: 'indexing' },
                            ],
                        },
                        {
                            displayName: 'gitlab.com/my/repo',
                            providers: [
                                {
                                    kind: 'embeddings',
                                    type: 'remote',
                                    remoteName: 'gitlab.com/my/repo',
                                    origin: 'sourcegraph.com',
                                    state: 'ready',
                                },
                            ],
                        },
                        {
                            displayName: 'github.com/sourcegraph/bar',
                            providers: [
                                {
                                    kind: 'embeddings',
                                    type: 'remote',
                                    remoteName: 'github.com/sourcegraph/bar',
                                    origin: 'sourcegraph.sourcegraph.com',
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
