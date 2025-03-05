import type { FC } from 'react'
import { useMemo } from 'react'
import 'highlight.js/styles/github.css'
import hljs from 'highlight.js/lib/core'
import { SYNTAX_HIGHLIGHTING_LANGUAGES } from '../../utils/highlight'

import { SyntaxHighlighter } from './SyntaxHighlighter'

// Ensure JSON language is registered for highlighting
hljs.registerLanguage('json', SYNTAX_HIGHLIGHTING_LANGUAGES.json)

/**
 * A hook that formats and highlights JSON data
 *
 * @param data The JSON data to format and highlight
 * @returns The highlighted HTML string or null if the data is invalid
 */
const useJsonHighlighting = (data: any): string | null => {
    return useMemo(() => {
        if (data === null || data === undefined) return null

        try {
            const jsonString = JSON.stringify(data, null, 2)
            const result = hljs.highlight(jsonString, { language: 'json' })
            return result.value
        } catch (error) {
            console.error('Error highlighting JSON:', error)
            return null
        }
    }, [data])
}

interface JsonViewerProps {
    data: any
    className?: string
    maxHeight?: string
    title?: string
}

/**
 * A reusable component for displaying JSON data with syntax highlighting
 */
export const JsonViewer: FC<JsonViewerProps> = ({ data, className = '', maxHeight = '80', title }) => {
    const highlightedJson = useJsonHighlighting(data)

    if (data === null || data === undefined) {
        return null
    }

    return (
        <div className={`tw-space-y-2 ${className}`}>
            {title && <h4 className="tw-text-sm tw-font-medium tw-mb-2">{title}</h4>}
            <div
                className={`tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-max-h-${maxHeight} tw-overflow-y-auto`}
            >
                <pre className="tw-whitespace-pre-wrap tw-m-0 tw-font-mono tw-leading-relaxed">
                    {highlightedJson ? (
                        <SyntaxHighlighter highlightedCode={highlightedJson} />
                    ) : (
                        JSON.stringify(data, null, 2)
                    )}
                </pre>
            </div>
        </div>
    )
}
