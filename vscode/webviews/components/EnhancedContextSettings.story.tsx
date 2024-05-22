import { useArgs } from '@storybook/preview-api'
import type { Meta, StoryObj } from '@storybook/react'

import type { ContextProvider, LocalEmbeddingsProvider, SearchProvider } from '@sourcegraph/cody-shared'

import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import {
    EnhancedContextContext,
    EnhancedContextEventHandlers,
    type EnhancedContextEventHandlersT,
    EnhancedContextPresentationMode,
    EnhancedContextSettings,
} from './EnhancedContextSettings'

const meta: Meta<typeof EnhancedContextSettings> = {
    title: 'cody/Enhanced Context Settings',
    component: EnhancedContextSettings,
    decorators: [VSCodeStandaloneComponent],
}

export default meta

interface SingleTileArgs {
    isOpen: boolean
    presentationMode: EnhancedContextPresentationMode
    name: string
    kind: 'embeddings' | 'search'
    type: 'local' | 'remote'
    state: 'indeterminate' | 'unconsented' | 'indexing' | 'ready' | 'no-match'
    id: string
    inclusion: 'auto' | 'manual'
}

export const SingleTile: StoryObj<typeof EnhancedContextSettings | SingleTileArgs> = {
    args: {
        presentationMode: EnhancedContextPresentationMode.Consumer,
        defaultOpen: true,
        name: '~/sourcegraph',
        kind: 'search',
        type: 'local',
        state: 'ready',
    },
    argTypes: {
        presentationMode: {
            options: ['consumer', 'enterprise'],
            control: 'radio',
        },
        defaultOpen: { control: 'boolean', defaultValue: true },
        name: { control: 'text' },
        kind: {
            options: ['embeddings', 'search'],
            control: 'radio',
        },
        type: {
            options: ['local', 'remote'],
            control: 'radio',
            if: {
                arg: 'kind',
                eq: 'search',
            },
        },
        state: {
            options: ['indeterminate', 'unconsented', 'indexing', 'ready', 'no-match'],
            control: 'select',
        },
        id: { control: 'text' },
        inclusion: {
            options: ['auto', 'manual'],
            control: 'radio',
        },
    },
    render: function Render() {
        const [args, updateArgs] = useArgs<SingleTileArgs>()

        const eventHandlers: EnhancedContextEventHandlersT = {
            onChooseRemoteSearchRepo(): void {
                alert('Choose some repositories...')
            },
            onConsentToEmbeddings(provider: LocalEmbeddingsProvider): void {
                updateArgs({ state: 'indexing' })
            },
            onEnabledChange(enabled: boolean): void {
                console.log(`Thank you for ${enabled ? 'enabling' : 'disabling'} the enhanced context!`)
            },
            onRemoveRemoteSearchRepo(id): void {
                alert(`Remove remote search repo "${id}"`)
            },
            onShouldBuildSymfIndex(provider: SearchProvider): void {
                updateArgs({ state: 'indexing' })
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
                                    name: args.name,
                                    id: args.id,
                                    inclusion: args.inclusion,
                                } as ContextProvider,
                            ],
                        },
                    ],
                }}
            >
                <EnhancedContextEventHandlers.Provider value={eventHandlers}>
                    <EnhancedContextSettings {...args} />
                </EnhancedContextEventHandlers.Provider>
            </EnhancedContextContext.Provider>
        )
    },
}

export const ConsumerMultipleProviders: StoryObj<typeof EnhancedContextSettings> = {
    render: function Render() {
        return (
            <EnhancedContextContext.Provider
                value={{
                    groups: [
                        {
                            displayName: '~/projects/foo',
                            providers: [
                                {
                                    kind: 'embeddings',
                                    state: 'unconsented',
                                    embeddingsAPIProvider: 'openai',
                                },
                                { kind: 'search', type: 'local', state: 'indexing' },
                            ],
                        },
                    ],
                }}
            >
                <EnhancedContextSettings
                    defaultOpen={true}
                    presentationMode={EnhancedContextPresentationMode.Consumer}
                />
            </EnhancedContextContext.Provider>
        )
    },
}

export const EnterpriseNoRepositories: StoryObj<typeof EnhancedContextSettings> = {
    render: function Render() {
        return (
            <EnhancedContextContext.Provider
                value={{
                    groups: [],
                }}
            >
                <EnhancedContextSettings
                    defaultOpen={true}
                    presentationMode={EnhancedContextPresentationMode.Enterprise}
                />
            </EnhancedContextContext.Provider>
        )
    },
}

export const EnterpriseMultipleRepositories: StoryObj<typeof EnhancedContextSettings> = {
    render: function Render() {
        return (
            <EnhancedContextContext.Provider
                value={{
                    groups: [
                        {
                            displayName: 'github.com/megacorp/foo',
                            providers: [
                                {
                                    kind: 'search',
                                    type: 'remote',
                                    state: 'ready',
                                    id: 'pqrxy',
                                    inclusion: 'manual',
                                    isIgnored: false,
                                },
                            ],
                        },
                        {
                            displayName: 'github.com/megacorp/bar',
                            providers: [
                                {
                                    kind: 'search',
                                    type: 'remote',
                                    state: 'ready',
                                    id: 'xgzwa',
                                    inclusion: 'auto',
                                    isIgnored: true,
                                },
                            ],
                        },
                        {
                            displayName: 'github.com/subsidiarycorp/handbook',
                            providers: [
                                {
                                    kind: 'search',
                                    type: 'remote',
                                    state: 'ready',
                                    id: 'pffty',
                                    inclusion: 'manual',
                                    isIgnored: false,
                                },
                            ],
                        },
                    ],
                }}
            >
                <EnhancedContextSettings
                    defaultOpen={true}
                    presentationMode={EnhancedContextPresentationMode.Enterprise}
                />
            </EnhancedContextContext.Provider>
        )
    },
}
