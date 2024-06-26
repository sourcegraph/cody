import type { Meta, StoryObj } from '@storybook/react'

import { useArgs } from '@storybook/preview-api'
import type { ComponentProps } from 'react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { ContextSelectField } from './ContextSelectField'
import type { Context } from './contexts'

const FIXTURE_CONTEXTS: Context[] = [
    {
        id: '1',
        name: 'global',
        description: 'All repositories',
        query: '',
        default: true,
        starred: false,
    },
    {
        id: '2',
        name: 'openctx-stuff',
        description: 'All OpenCtx-related code',
        query: '(repo:^github\\.com/sourcegraph/cody$ file:openctx) OR (repo:^github\\.com/sourcegraph/openctx$)',
        default: false,
        starred: false,
    },
    {
        id: '3',
        name: 'cody-agent',
        query: 'repo:^github\\.com/sourcegraph/cody$ file:^agent/',
        default: false,
        starred: false,
    },
    {
        id: '4',
        name: 'bazel-examples',
        query: 'repo:^github\\.com/sourcegraph/sourcegraph$ file:BUILD\\.bazel$',
        default: false,
        starred: false,
    },
    {
        id: '5',
        name: 'vite-examples',
        query: 'repo:^github\\.com/sourcegraph/ file:vite(st)?\\.config\\.ts$',
        default: false,
        starred: false,
    },
]

const meta: Meta<typeof ContextSelectField> = {
    title: 'cody/ContextSelectField',
    component: ContextSelectField,
    decorators: [
        story => <div style={{ width: '400px', maxHeight: 'max(300px, 80vh)' }}> {story()} </div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        contexts: FIXTURE_CONTEXTS,
        currentContext: FIXTURE_CONTEXTS[0],
        __storybook__open: true,
    },
    render: () => {
        const [args, updateArgs] = useArgs<ComponentProps<typeof ContextSelectField>>()
        return (
            <ContextSelectField
                {...args}
                onCurrentContextChange={context => {
                    updateArgs({
                        currentContext: context,
                    })
                }}
            />
        )
    },
}

export default meta

type Story = StoryObj<typeof ContextSelectField>

export const Default: Story = {
    args: {},
}
