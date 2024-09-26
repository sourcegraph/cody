import type { View } from '@/tabs'
import type { CodyIDE, Prompt } from '@sourcegraph/cody-shared'
import { BookOpen, FileQuestion, Hammer, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { useClientActionDispatcher } from '../../client/clientState'
import { usePromptsQuery } from '../../components/promptList/usePromptsQuery'
import { onPromptSelectInPanel } from '../../prompts/PromptsTab'
import { useDebounce } from '../../utils/useDebounce'
import PromptBox, { type PromptBoxProps } from './PromptBox'
import styles from './WelcomeMessage.module.css'

interface WelcomeMessageProps {
    IDE: CodyIDE
    setView: (view: View) => void
}

export function WelcomeMessage({ IDE, setView }: WelcomeMessageProps) {
    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 250)
    const { value, error } = usePromptsQuery(debouncedQuery)
    const promptsType = value?.prompts.type
    const customPrompts = value && promptsType === 'results' ? value.prompts.results : []
    const dispatchClientAction = useClientActionDispatcher()

    const extractPromptsForPromptBox = (prompts: Prompt[]) => {
        const promptBoxPrompts: PromptBoxProps[] = []
        for (const prompt of prompts) {
            promptBoxPrompts.push({
                prompt: prompt,
                onSelect: () => {
                    onPromptSelectInPanel(
                        { type: 'prompt', value: prompt },
                        setView,
                        dispatchClientAction
                    )
                },
                icon: prompt.icon,
            })
        }
        return promptBoxPrompts
    }

    const displayPrompts = () => {
        if (error) {
            console.error(
                'An error occurred while fetching prompts:\n',
                error.message + '\n',
                error.stack ?? ''
            )
            return <div>{error.message}</div>
        }

        const prompts: PromptBoxProps[] =
            customPrompts.length > 0
                ? extractPromptsForPromptBox(customPrompts)
                : extractPromptsForPromptBox(standardPrompts)

        return prompts.map(p => {
            return (
                <PromptBox
                    key={p.prompt.id}
                    prompt={p.prompt}
                    icon={p.icon ?? undefined}
                    onSelect={p.onSelect}
                />
            )
        })
    }

    return <div className={styles.prompts}>{displayPrompts()}</div>
}

// temporary hard-coded values
export const standardPrompts: Prompt[] = [
    {
        id: '12345',
        name: 'Edit Code',
        description: 'Run on a file or selection to modify code',
        nameWithOwner: '',
        owner: {
            namespaceName: '',
        },
        draft: false,
        definition: {
            text: "Here's the prompt that should be ammended. I need to go back and make these prompts legit",
        },
        url: '',
        icon: PencilLine,
    },
    {
        id: '123456',
        name: 'Explain Code',
        description: 'Understand the open project or file better',
        nameWithOwner: '',
        owner: {
            namespaceName: '',
        },
        draft: false,
        definition: {
            text: "Here's the prompt that should be ammended. I need to go back and make these prompts legit",
        },
        url: '',
        icon: FileQuestion,
    },
    {
        id: '1234567',
        name: 'Document Code',
        description: 'Add comments to file or section',
        nameWithOwner: '',
        owner: {
            namespaceName: '',
        },
        draft: false,
        definition: {
            text: "Here's the prompt that should be ammended. I need to go back and make these prompts legit",
        },
        url: '',
        icon: BookOpen,
    },
    {
        id: '12345678',
        name: 'Generate Unit Tests',
        description: 'Create tests for the open file',
        nameWithOwner: '',
        owner: {
            namespaceName: '',
        },
        draft: false,
        definition: {
            text: "Here's the prompt that should be ammended. I need to go back and make these prompts legit",
        },
        url: '',
        icon: Hammer,
    },
]
