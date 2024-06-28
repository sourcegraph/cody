import type { Meta, StoryObj } from '@storybook/react'

import { useArgs } from '@storybook/preview-api'
import type { ComponentProps } from 'react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { ContextSelectField } from './ContextSelectField'
import { FIXTURE_CONTEXTS } from './fixtures'

const meta: Meta<typeof ContextSelectField> = {
    title: 'cody/ContextSelectField',
    component: ContextSelectField,
    decorators: [
        story => <div style={{ width: '400px', maxHeight: 'max(300px, 80vh)' }}> {story()} </div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        contexts: FIXTURE_CONTEXTS,
        currentContext: null,
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
