import styles from './WelcomeMessage.module.css'
import { useState } from 'react'
import { useDebounce } from '../../utils/useDebounce'
import { usePromptsQuery } from '../../components/promptList/usePromptsQuery'
import { standardPrompts } from './StandardPromptsContent'
import PromptBox from './PromptBox'

export function WelcomeMessage() {
    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 250)
    const { value, error } = usePromptsQuery(debouncedQuery)
    const promptsType = value?.prompts.type
    const defaultPrompts = value?.standardPrompts && value.standardPrompts.length > 0
        ? value?.standardPrompts
        : standardPrompts;
    const customPrompts = value && promptsType === 'results' ? value.prompts.results : []

    const displayPrompts = () => {
        if (error) {
            console.error(
                "An error occurred while fetching prompts:\n",
                error.message + '\n',
                error.stack ?? ''
            )
            return <div>{error.message}</div>
        }

        const prompts: any[] = customPrompts.length > 0 ? customPrompts : defaultPrompts;

        return prompts.map((p) => {
            return (
                <PromptBox
                    key={p.id}
                    prompt={p}
                    icon={p.icon ?? undefined}
                    onClick={() => console.log(p.definition.text)}
                />
            )
        })
    }

    return (
        <div className={styles.prompts}>
            {displayPrompts()}
        </div>
    )
}

