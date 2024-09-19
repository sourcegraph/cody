import { PromptSuggestions, PromptSuggestionsProps } from './PromptSuggestions'
import type { StoryObj } from '@storybook/react'
import type { Meta } from '@storybook/react'

const meta: Meta<typeof PromptSuggestions> = {
    title: 'PromptSuggestions',
    component: PromptSuggestions,
    tags: ['autodocs'],
}



export default meta


type Story = StoryObj<typeof PromptSuggestions>

let suggestionProps: PromptSuggestionsProps = {
    suggestions: [
        { label: 'Document the detect_chat_intent function in intent_detection.py', id: 1 },
        { label: 'Add unit tests for PromptSuggestions component', id: 2 },
        { label: 'Refactor the UserAuthentication module for better performance', id: 3 },
        { label: 'Implement error handling for PromptSuggestions component', id: 4 },
    ],
}

export const Default: Story = {
    args: suggestionProps,
}

export const NoExamples: Story = {
    args: {
        suggestions: [],
    },
}
let singleSuggestion: PromptSuggestionsProps = {
    suggestions: [
        { label: 'Document the detect_chat_intent function in intent_detection.py', id: 1 }
    ],
}

export const Processing: Story = {
    args: {
        ...singleSuggestion,
        status: 'processing',
    },
}
