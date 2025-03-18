import type { FC } from 'react'
import 'highlight.js/styles/github.css'
import hljs from 'highlight.js/lib/core'

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
}> = ({ sideBySideDiffDecorationInfo, languageId }) => {
    const sideBySideLines = buildSideBySideLines(sideBySideDiffDecorationInfo, languageId)

    return (
        <div className="tw-overflow-x-auto">
            <table className="tw-min-w-full tw-text-sm diff-table tw-font-mono">
                <thead>
                    <tr className="tw-border-b tw-border-gray-300 tw-bg-gray-50">
                        <th className="tw-w-12 tw-text-right tw-pr-2 tw-sticky tw-left-0 tw-z-10 tw-bg-gray-50" />
                        <th className="tw-w-[calc(50%-24px)] tw-text-left">Code To Rewrite</th>
                        <th className="tw-w-12 tw-text-right tw-pr-2" />
                        <th className="tw-w-[calc(50%-24px)] tw-text-left">Prediction</th>
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
