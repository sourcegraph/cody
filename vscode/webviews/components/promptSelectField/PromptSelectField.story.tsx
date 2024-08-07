import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { PromptSelectField } from './PromptSelectField'

const meta: Meta<typeof PromptSelectField> = {
    title: 'cody/PromptSelectField',
    component: PromptSelectField,
    decorators: [
        story => <div style={{ width: '400px', maxHeight: 'max(300px, 80vh)' }}> {story()} </div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        __storybook__open: true,
        onSelect: () => {},
    },
}

export default meta

type Story = StoryObj<typeof PromptSelectField>

export const Default: Story = {
    args: {},
}
