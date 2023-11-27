import { Meta, StoryObj } from '@storybook/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { EnhancedContextContext, EnhancedContextSettings } from './EnhancedContextSettings'

const meta: Meta<typeof EnhancedContextSettings> = {
    title: 'cody/Enhanced Context',
    component: EnhancedContextSettings,
    decorators: [VSCodeStoryDecorator],
}

export default meta

export const Smorgasbord: StoryObj<typeof EnhancedContextSettings> = {
    render: () => (
        <EnhancedContextContext.Provider
            value={{
                enabled: true,
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
                                type: 'remote',
                                remoteName: 'gitlab.com/my/repo',
                                origin: 'sourcegraph.com',
                                state: 'ready',
                            },
                        ],
                    },
                    {
                        name: 'github.com/sourcegraph/bar',
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
                <EnhancedContextSettings />
            </div>
        </EnhancedContextContext.Provider>
    ),
}
