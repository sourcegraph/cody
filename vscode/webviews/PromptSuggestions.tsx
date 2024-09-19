import React from 'react'
import styles from './PromptSuggestions.module.css'
import { BadgeAlert } from "lucide-react"
import {Alert, AlertDescription, AlertTitle} from './components/shadcn/ui/alert.tsx'

interface SuggestedPrompt {
        label: string
        id: number
}

export interface PromptSuggestionsProps {
    examples?: SuggestedPrompt[]
}

export const PromptSuggestions: React.FunctionComponent<PromptSuggestionsProps> = ({examples}) => {

    const suggestions = examples?.map((example) => (
        <li className={styles.promptSuggestion}>{example.label}</li>
    ))

    return (
        <Alert>
            <BadgeAlert className="h-4 w-4" />
            <AlertTitle>Prompt suggestions</AlertTitle>
            <AlertDescription>
                <ul className={styles.promptSuggestionsList}>
                    {suggestions}
                </ul>
            </AlertDescription>
        </Alert>
    )
}
export default PromptSuggestions
