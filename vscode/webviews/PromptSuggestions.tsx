import React from 'react'
import styles from './PromptSuggestions.module.css'
import { BadgeAlert, FileText, Code, HelpCircle, Loader, TestTubeDiagonal } from "lucide-react"
import {Alert, AlertDescription, AlertTitle} from './components/shadcn/ui/alert.tsx'

interface SuggestedPrompt {
        label: string
        id: number
        prompt:"A prompt text"
}

export interface PromptSuggestionsProps {
    suggestions?: SuggestedPrompt[]
}

type PromptSuggestionStatus = 'processing' | 'completed';

export const PromptSuggestions: React.FunctionComponent<PromptSuggestionsProps & { status: PromptSuggestionStatus }> = ({suggestions, status}) => {

    const psuggestions = suggestions?.map((example) => (
        <li key={example.id} className={styles.promptSuggestion} >
            <a href="#" onClick={(e) => {
                    e.preventDefault();
                    console.log(example.prompt);
                }} className="tw-flex tw-items-center">
                    {getIconForSuggestion(example.label)}
                    <span>{example.label}</span>
            </a>
        </li>
    ))

    //todo: this is a hack, refactor
    if (!psuggestions || psuggestions.length === 0) {
        return <div/>
    }

    return (
        <Alert className="suggestionAlertStyle" >
            {status === 'processing' ? (
                <>
                    <Loader className="tw-h-[1rem] tw-w-[1rem] tw-animate-pulse" />
                    <AlertTitle>Reviewing code for suggestions</AlertTitle>
                </>
            ) : (
                <AlertTitle className="tw-text-lg tw-ml-8 tw-mt-6">Suggestions from your code</AlertTitle>
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

const getIconForSuggestion = (label: string): React.ReactElement => {

    let icon: React.ReactElement = <HelpCircle className="tw-mr-4 tw-h-[1rem] tw-w-[1rem]" />;

    if (label.toLowerCase().includes('error')) {
        icon = <BadgeAlert className="tw-mr-4 tw-h-[1rem] tw-w-[1rem]" />;
    } else if(label.toLowerCase().includes('file')) {
        icon = <FileText className="tw-mr-4 tw-h-[1rem] tw-w-[1rem]" />
    } else if(label.toLowerCase().includes('test')) {
        icon = <TestTubeDiagonal className="tw-mr-4 tw-h-[1rem] tw-w-[1rem]" />
    } else if(label.toLowerCase().includes('refactor')) {
        icon = <Code className="tw-mr-4 tw-h-[1rem] tw-w-[1rem]" />;
    }

    return icon;
}
