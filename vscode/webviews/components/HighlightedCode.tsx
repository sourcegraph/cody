import { clsx } from 'clsx'
import type React from 'react'

interface HighlightedCodeProps {
    code: string
    language?: string
    className?: string
}

/**
 * HighlightedCode renders code with proper syntax highlighting.
 * We rely on the rehype-highlight plugin to add the syntax highlighting CSS classes.
 */
export const HighlightedCode: React.FC<HighlightedCodeProps> = ({ code, language, className }) => {
    return (
        <pre
            className={clsx(
                'tw-p-4 tw-m-0 tw-overflow-auto tw-bg-gray-50 dark:tw-bg-gray-800',
                className
            )}
        >
            <code className={clsx(language && `language-${language}`)}>{code}</code>
        </pre>
    )
}
