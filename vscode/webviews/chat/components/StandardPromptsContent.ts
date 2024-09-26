import { BookOpen, FileQuestion, Hammer, PencilLine } from 'lucide-react'

import type { PromptBoxProps } from './PromptBox'

export const standardPrompts: PromptBoxProps[] = [
    {
        onSelect: () => {},
        prompt: {
            id: '123456',
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
        },
        icon: PencilLine,
    },
    {
        onSelect: () => {},
        prompt: {
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
        },
        icon: FileQuestion,
    },
    {
        onSelect: () => {},
        prompt: {
            id: '123456',
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
        },
        icon: BookOpen,
    },
    {
        onSelect: () => {},
        prompt: {
            id: '123456',
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
        },
        icon: Hammer,
    },
]
