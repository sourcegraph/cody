import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { PromptSelectField } from './PromptSelectField'
import { type PromptsClient, PromptsClientProviderForTestsOnly } from './promptsClient'

const meta: Meta<typeof PromptSelectField> = {
    title: 'cody/PromptSelectField',
    component: PromptSelectField,
    decorators: [
        story => <div style={{ width: '400px', maxHeight: 'max(300px, 80vh)' }}> {story()} </div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        __storybook__open: true,
    },
}

export default meta

type Story = StoryObj<typeof PromptSelectField>

export const Default: Story = {
    args: {},
}

const ERROR_CLIENT: PromptsClient = {
    queryPrompts: () => Promise.reject(new Error('my error message')),
}

export const ErrorMessage: Story = {
    args: {
        __storybook__open: true,
    },
    render: args => (
        <PromptsClientProviderForTestsOnly value={ERROR_CLIENT}>
            <PromptSelectField {...args} />
        </PromptsClientProviderForTestsOnly>
    ),
}
