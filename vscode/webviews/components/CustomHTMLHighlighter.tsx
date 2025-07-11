/**
 * Custom syntax highlighting component that doesn't leak memory
 * Replaces rehype-highlight to avoid memory accumulation
 */

import type React from 'react'
import { useMemo } from 'react'

// Simple regex-based syntax highlighting patterns
const HIGHLIGHT_PATTERNS = {
    javascript: [
        {
            pattern: /\b(function|const|let|var|return|if|else|for|while|class|import|export)\b/g,
            className: 'hljs-keyword',
        },
        { pattern: /\b(true|false|null|undefined)\b/g, className: 'hljs-literal' },
        { pattern: /"([^"\\]|\\.)*"/g, className: 'hljs-string' },
        { pattern: /'([^'\\]|\\.)*'/g, className: 'hljs-string' },
        { pattern: /`([^`\\]|\\.)*`/g, className: 'hljs-string' },
        { pattern: /\/\/.*$/gm, className: 'hljs-comment' },
        { pattern: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' },
        { pattern: /\b\d+(\.\d+)?\b/g, className: 'hljs-number' },
    ],
    typescript: [
        {
            pattern:
                /\b(function|const|let|var|return|if|else|for|while|class|import|export|interface|type|enum)\b/g,
            className: 'hljs-keyword',
        },
        { pattern: /\b(string|number|boolean|any|void|never)\b/g, className: 'hljs-type' },
        { pattern: /\b(true|false|null|undefined)\b/g, className: 'hljs-literal' },
        { pattern: /"([^"\\]|\\.)*"/g, className: 'hljs-string' },
        { pattern: /'([^'\\]|\\.)*'/g, className: 'hljs-string' },
        { pattern: /`([^`\\]|\\.)*`/g, className: 'hljs-string' },
        { pattern: /\/\/.*$/gm, className: 'hljs-comment' },
        { pattern: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' },
        { pattern: /\b\d+(\.\d+)?\b/g, className: 'hljs-number' },
    ],
    python: [
        {
            pattern: /\b(def|class|import|from|return|if|else|elif|for|while|try|except|with|as)\b/g,
            className: 'hljs-keyword',
        },
        { pattern: /\b(True|False|None)\b/g, className: 'hljs-literal' },
        { pattern: /"([^"\\]|\\.)*"/g, className: 'hljs-string' },
        { pattern: /'([^'\\]|\\.)*'/g, className: 'hljs-string' },
        { pattern: /#.*$/gm, className: 'hljs-comment' },
        { pattern: /\b\d+(\.\d+)?\b/g, className: 'hljs-number' },
    ],
    go: [
        {
            pattern: /\b(func|var|const|type|import|package|return|if|else|for|range|switch|case)\b/g,
            className: 'hljs-keyword',
        },
        { pattern: /\b(true|false|nil)\b/g, className: 'hljs-literal' },
        { pattern: /"([^"\\]|\\.)*"/g, className: 'hljs-string' },
        { pattern: /`([^`\\]|\\.)*`/g, className: 'hljs-string' },
        { pattern: /\/\/.*$/gm, className: 'hljs-comment' },
        { pattern: /\/\*[\s\S]*?\*\//g, className: 'hljs-comment' },
        { pattern: /\b\d+(\.\d+)?\b/g, className: 'hljs-number' },
    ],
}

const DEFAULT_PATTERNS = [
    { pattern: /"([^"\\]|\\.)*"/g, className: 'hljs-string' },
    { pattern: /'([^'\\]|\\.)*'/g, className: 'hljs-string' },
    { pattern: /\b\d+(\.\d+)?\b/g, className: 'hljs-number' },
]

function highlightCode(code: string, language?: string): string {
    if (!code) return ''

    const patterns = HIGHLIGHT_PATTERNS[language as keyof typeof HIGHLIGHT_PATTERNS] || DEFAULT_PATTERNS

    // Escape HTML first
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Find all matches for all patterns
    const matches: Array<{ start: number; end: number; className: string; text: string }> = []

    for (const { pattern, className } of patterns) {
        pattern.lastIndex = 0 // Reset regex
        let match = pattern.exec(escaped)
        while (match !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                className,
                text: match[0],
            })
            if (!pattern.global) break
            match = pattern.exec(escaped)
        }
    }

    // Sort matches by position and filter out overlaps
    matches.sort((a, b) => a.start - b.start)
    const filteredMatches = []
    let lastEnd = 0

    for (const match of matches) {
        if (match.start >= lastEnd) {
            filteredMatches.push(match)
            lastEnd = match.end
        }
    }

    // Build the final highlighted string
    let result = ''
    let currentIndex = 0

    for (const match of filteredMatches) {
        // Add text before match
        if (match.start > currentIndex) {
            result += escaped.slice(currentIndex, match.start)
        }
        // Add highlighted match
        result += `<span class="${match.className}">${match.text}</span>`
        currentIndex = match.end
    }

    // Add remaining text
    if (currentIndex < escaped.length) {
        result += escaped.slice(currentIndex)
    }

    return result
}

export const CustomHTMLHighlighter: React.FC<{
    code: string
    language?: string
    className?: string
}> = ({ code, language, className }) => {
    const highlightedCode = useMemo(() => {
        return highlightCode(code, language)
    }, [code, language])

    return (
        <pre className={`hljs ${className || ''}`}>
            <code
                className={language ? `language-${language}` : ''}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
                dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
        </pre>
    )
}
