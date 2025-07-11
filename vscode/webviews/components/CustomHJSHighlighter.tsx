import hljs from 'highlight.js'
import { useMemo } from 'react'
import type React from 'react'

const useHighlightedCode = true

export const CustomHJSHighlighter: React.FC<{
    code: string
    language?: string
    className?: string
}> = ({ code, language, className }) => {
    const highlightedCode = useMemo(() => {
        if (!code) return ''

        try {
            // Try to highlight with the specified language
            if (language && hljs.getLanguage(language)) {
                const result = hljs.highlight(code, { language })
                return useHighlightedCode ? result.value : code
            }

            // Fall back to auto-detection
            const result = hljs.highlightAuto(code)
            return useHighlightedCode ? result.value : code
        } catch (error) {
            // If highlighting fails, return plain text
            console.warn('Syntax highlighting failed:', error)
            return code
        }
    }, [code, language])

    return (
        <pre className={`hljs ${className || ''}`}>
            <code
                className={language ? `language-${language}` : ''}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for syntax highlighting
                dangerouslySetInnerHTML={{ __html: highlightedCode }}
                data-language={language || undefined}
            />
        </pre>
    )
}

CustomHJSHighlighter.displayName = 'CustomHJSHighlighter'
