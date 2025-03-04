import type { FC } from 'react'

interface SyntaxHighlighterProps {
    highlightedCode: string
    className?: string
}

/**
 * A component that safely encapsulates the dangerouslySetInnerHTML usage for syntax highlighting.
 * This concentrates the linter warning to a single component rather than having it scattered
 * throughout the codebase.
 */
export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({ highlightedCode, className }) => {
    // If there's no highlighted code, don't render anything
    if (!highlightedCode) {
        return null
    }

    return (
        <span
            className={className}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: it's safe for debugging
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
    )
}

/**
 * Represents a line or segment of code that may have syntax highlighting.
 */
export interface HighlightedSegment {
    text: string
    highlightedHtml?: string
    className?: string
    isChange?: boolean // Flag to indicate if this is a change that should be prominently displayed
}

/**
 * Component to render a line or segment of code that may have syntax highlighting applied.
 */
export const CodeSegment: FC<HighlightedSegment> = ({ text, highlightedHtml, className, isChange }) => {
    // Combine classes for consistent styling
    const combinedClass = `${className || ''} ${isChange ? 'tw-font-semibold' : ''}`.trim()

    // If there's highlighted HTML, use it, otherwise just render the text
    if (highlightedHtml) {
        return <SyntaxHighlighter highlightedCode={highlightedHtml} className={combinedClass} />
    }

    // If no highlighting, just render the text directly
    return <span className={combinedClass}>{text}</span>
}
