import {
    BookOpen,
    FileQuestion,
    Hammer,
    PencilLine,
} from "lucide-react"

import type { PromptBoxProps } from "./PromptBox"

export const standardPrompts: PromptBoxProps[] = [
    {
        name: "Edit Code",
        description: "Run on a file or selection to modify code",
        icon: PencilLine
    },
    {
        name: "Explain Code",
        description: "Understand the open project or file better",
        icon: FileQuestion
    },
    {
        name: "Document Code",
        description: "Add comments to file or section",
        icon: BookOpen
    },
    {
        name: "Generate Unit Tests",
        description: "Create tests for the open file",
        icon: Hammer
    },
]
