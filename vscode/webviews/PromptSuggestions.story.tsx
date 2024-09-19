import { PromptSuggestions, PromptSuggestionsProps } from './PromptSuggestions'
import type { StoryObj } from '@storybook/react'
import type { Meta } from '@storybook/react'

const meta: Meta<typeof PromptSuggestions> = {
    title: 'PromptSuggestions',
    component: PromptSuggestions,
    tags: ['autodocs'],
}

const exampleProps: PromptSuggestionsProps = {
    examples: [
        { label: 'Document the detect_chat_intent function in intent_detection.py', id: 1 },
        { label: 'Add unit tests for PromptSuggestions component', id: 2 },
        { label: 'Refactor the UserAuthentication module for better performance', id: 3 },
        { label: 'Implement error handling for PromptSuggestions component', id: 4 },
    ],
}

export default meta


type Story = StoryObj<typeof PromptSuggestions>

export const Default: Story = {
    args: exampleProps,
}

export const NoExamples: Story = {
    args: {
        examples: [],
    },
}

export const SingleExample: Story = {
    args: exampleProps,
}
