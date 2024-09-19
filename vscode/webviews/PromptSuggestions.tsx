import React from 'react'
import styles from './PromptSuggestions.module.css'
import { BadgeAlert, Loader } from "lucide-react"
import {Alert, AlertDescription, AlertTitle} from './components/shadcn/ui/alert.tsx'

interface SuggestedPrompt {
        label: string
        id: number
}

export interface PromptSuggestionsProps {
    suggestions?: SuggestedPrompt[]
}

type PromptSuggestionStatus = 'processing' | 'completed';

export const PromptSuggestions: React.FunctionComponent<PromptSuggestionsProps & { status: PromptSuggestionStatus }> = ({suggestions, status}) => {

    const psuggestions = suggestions?.map((example) => (
        <li className={styles.promptSuggestion}>{example.label}</li>
    ))


    //todo: this is a hack, refactor
    if (!psuggestions || psuggestions.length === 0) {
        return <div/>
    }

    return (
        <Alert>
            {status === 'processing' ? (
                <>
                    <Loader className="tw-h-[1rem] tw-w-[1rem] tw-animate-pulse" />
                    <AlertTitle>Reviewing code for suggestions</AlertTitle>
                </>
            ) : (
                <>
                    <BadgeAlert className="tw-h-[1rem] tw-w-[1rem]" />
                    <AlertTitle>Prompt suggestions</AlertTitle>
                </>
            )}
            <AlertDescription>
                {psuggestions && psuggestions.length !== 0 && (
                    <ul className={styles.promptSuggestionsList}>
                        {psuggestions}
                    </ul>
                )}
            </AlertDescription>
        </Alert>
    )
}
export default PromptSuggestions
