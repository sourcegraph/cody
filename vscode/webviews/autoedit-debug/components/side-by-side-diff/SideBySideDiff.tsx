import type { FC } from 'react'
import 'highlight.js/styles/github.css'
import hljs from 'highlight.js/lib/core'
import { useState } from 'react'

import type {
    DecorationInfo,
    DecorationLineInfo,
} from '../../../../src/autoedits/renderer/decorators/base'

import { SYNTAX_HIGHLIGHTING_LANGUAGES } from '../../../utils/highlight'
import { buildSideBySideLines } from './utils'

for (const [name, language] of Object.entries(SYNTAX_HIGHLIGHTING_LANGUAGES)) {
    hljs.registerLanguage(name, language)
}

/**
 * The main SideBySideDiff React component.
 * Renders a two-column table of code lines (original on the left, modified on the right)
 * with syntax highlighting and sub-line highlights for inserts/deletes.
 * The container allows horizontal scrolling for long lines.
 */
export const SideBySideDiff: FC<{
    sideBySideDiffDecorationInfo: DecorationInfo
    languageId: string
    codeToRewrite: string
    prediction: string
}> = ({ sideBySideDiffDecorationInfo, languageId, codeToRewrite, prediction }) => {
    const sideBySideLines = buildSideBySideLines(sideBySideDiffDecorationInfo, languageId)
    const [leftCopySuccess, setLeftCopySuccess] = useState(false)
    const [rightCopySuccess, setRightCopySuccess] = useState(false)

    const handleCopy = (text: string, setSuccess: (success: boolean) => void) => {
        if (text) {
            navigator.clipboard
                .writeText(text)
                .then(() => {
                    setSuccess(true)
                    setTimeout(() => setSuccess(false), 2000)
                })
                .catch(err => console.error('Failed to copy text: ', err))
        }
    }

    return (
        <div className="tw-overflow-x-auto">
            <table className="tw-min-w-full tw-text-sm diff-table tw-font-mono">
                <thead>
                    <tr className="tw-border-b tw-border-gray-300 tw-bg-gray-50">
                        <th className="tw-w-12 tw-text-right tw-pr-2 tw-sticky tw-left-0 tw-z-10 tw-bg-gray-50" />
                        <th className="tw-w-[calc(50%-24px)] tw-text-left">
                            <div className="tw-flex tw-items-center tw-gap-2">
                                <span>Code To Rewrite</span>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(codeToRewrite, setLeftCopySuccess)}
                                    className="tw-text-xs tw-text-gray-600 hover:tw-text-gray-800 dark:tw-text-gray-400 dark:hover:tw-text-gray-200 tw-rounded tw-px-2 tw-py-1 tw-bg-gray-100 hover:tw-bg-gray-200 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 tw-transition-colors tw-duration-150"
                                    title="Copy code to rewrite"
                                    aria-label="Copy code to rewrite"
                                >
                                    {leftCopySuccess ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </th>
                        <th className="tw-w-12 tw-text-right tw-pr-2" />
                        <th className="tw-w-[calc(50%-24px)] tw-text-left">
                            <div className="tw-flex tw-items-center tw-gap-2">
                                <span>Prediction</span>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(prediction, setRightCopySuccess)}
                                    className="tw-text-xs tw-text-gray-600 hover:tw-text-gray-800 dark:tw-text-gray-400 dark:hover:tw-text-gray-200 tw-rounded tw-px-2 tw-py-1 tw-bg-gray-100 hover:tw-bg-gray-200 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 tw-transition-colors tw-duration-150"
                                    title="Copy prediction"
                                    aria-label="Copy prediction"
                                >
                                    {rightCopySuccess ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sideBySideLines.map((line, index) => (
                        <tr
                            // biome-ignore lint/suspicious/noArrayIndexKey: it's OK for debugging
                            key={index}
                            className="tw-align-top tw-border-b tw-last:border-b-0 tw-border-gray-200"
                        >
                            <td className="tw-text-gray-400 tw-text-right tw-pr-2 tw-sticky tw-left-0 tw-z-10 tw-bg-white">
                                {line.left.lineNumber ?? ''}
                            </td>
                            <td
                                className={`${lineTypeToTdClass(
                                    line.left.type
                                )} tw-px-2 tw-py-1 tw-whitespace-pre tw-overflow-visible`}
                                // biome-ignore lint/security/noDangerouslySetInnerHtml: it's OK for debugging
                                dangerouslySetInnerHTML={{ __html: line.left.html ?? '' }}
                            />
                            <td className="tw-text-gray-400 tw-text-right tw-pr-2">
                                {line.right.lineNumber ?? ''}
                            </td>
                            <td
                                className={`${lineTypeToTdClass(
                                    line.right.type
                                )} tw-px-2 tw-py-1 tw-whitespace-pre tw-overflow-visible`}
                                // biome-ignore lint/security/noDangerouslySetInnerHtml: it's OK for debugging
                                dangerouslySetInnerHTML={{ __html: line.right.html ?? '' }}
                            />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

/**
 * Map a line type to a CSS class for the cell background. We use Tailwind classes here,
 * but you can adapt these as needed.
 */
export function lineTypeToTdClass(type: DecorationLineInfo['type'] | 'empty') {
    switch (type) {
        case 'added':
            return 'tw-bg-green-50'
        case 'removed':
            return 'tw-bg-red-50'
        case 'modified':
            // Entire line tinted lightly; sub-line changes use .tw-bg-green-200/.tw-bg-red-200
            return 'tw-bg-yellow-50'
        default:
            return ''
    }
}
