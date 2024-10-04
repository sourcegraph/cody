import { type FC, type PropsWithChildren, useCallback } from 'react'

import { clsx } from 'clsx'

import type { ContentMatch, MatchGroup } from '../types'
import { SourcegraphURL } from '../url'
import { getFileMatchUrl } from '../utils'

import { CodeExcerpt } from './CodeExcerpt'

import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import resultStyles from '../CodeSnippet.module.css'
import styles from './FileMatchChildren.module.css'

interface FileMatchProps {
    result: ContentMatch
    grouped: MatchGroup[]
    serverEndpoint: string
}

export const FileMatchChildren: FC<PropsWithChildren<FileMatchProps>> = props => {
    const { result, grouped, serverEndpoint } = props

    const createCodeExcerptLink = (group: MatchGroup): string => {
        const urlBuilder = SourcegraphURL.from(getFileMatchUrl(serverEndpoint, result))

        const match = group.matches[0]

        if (match) {
            urlBuilder.setLineRange({
                line: match.startLine + 1,
                character: match.startCharacter + 1,
                endLine: match.endLine + 1,
                endCharacter: match.endCharacter + 1,
            })
        }

        return urlBuilder.toString()
    }

    const navigateToFile = useCallback(
        (line: number) => {
            // TODO: this does not work on web as opening links from within a web worker does not work.
            getVSCodeAPI().postMessage({
                command: 'links',
                value: `${getFileMatchUrl(serverEndpoint, result)}?L${line}`,
            })
        },
        [serverEndpoint, result]
    )

    return (
        <div data-testid="file-match-children">
            {grouped.length > 0 &&
                grouped.map(group => (
                    <div
                        key={`linematch:${getFileMatchUrl(serverEndpoint, result)}?${group.startLine}:${
                            group.endLine
                        }`}
                        data-href={createCodeExcerptLink(group)}
                        className={clsx(
                            'test-file-match-children-item',
                            styles.chunk,
                            resultStyles.clickable,
                            resultStyles.focusableBlock,
                            resultStyles.horizontalDividerBetween
                        )}
                    >
                        <CodeExcerpt
                            commitID={result.commit || ''}
                            filePath={result.path}
                            startLine={group.startLine}
                            endLine={group.endLine}
                            highlightRanges={group.matches}
                            plaintextLines={group.plaintextLines}
                            highlightedLines={group.highlightedHTMLRows}
                            onLineClick={navigateToFile}
                        />
                    </div>
                ))}
        </div>
    )
}
