import { BookOpen, FileQuestion, Hammer, PencilLine } from "lucide-react";
import type { PromptOrDeprecatedCommand } from "./PromptList";

// temporary hard-coded values
export const standardPrompts: PromptOrDeprecatedCommand[] = [
    {
        type: 'prompt',
        value: {
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
            createdBy: {
                username: 'jdoe',
                displayName: 'jdoe',
                avatarURL: '',
                primaryEmail: '',
            },
        },
        icon: PencilLine,
    },
    {
        type: 'prompt',
        value: {
            id: '234567',
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
            createdBy: {
                username: 'jdoe',
                displayName: 'jdoe',
                avatarURL: '',
                primaryEmail: '',
            },
            url: '',
        },
        icon: FileQuestion,
    },
    {
        type: 'prompt',
        value: {

            id: '345678',
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
            createdBy: {
                username: 'jdoe',
                displayName: 'jdoe',
                avatarURL: '',
                primaryEmail: '',
            },
            url: '',
        },
        icon: BookOpen,
    },
    {
        type: 'prompt',
        value: {
            id: '456789',
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
            createdBy: {
                username: 'jdoe',
                displayName: 'jdoe',
                avatarURL: '',
                primaryEmail: '',
            },
            url: '',
        },
        icon: Hammer,
    },
]

