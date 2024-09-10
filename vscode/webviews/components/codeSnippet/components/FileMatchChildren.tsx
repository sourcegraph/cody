import { type FC, type KeyboardEvent, type MouseEvent, type PropsWithChildren, useCallback } from 'react'

import { clsx } from 'clsx'

import type { ContentMatch, MatchGroup } from '../types'
import { SourcegraphURL } from '../url'
import { getFileMatchUrl } from '../utils'

import { CodeExcerpt } from './CodeExcerpt'

import resultStyles from '../CodeSnippet.module.css'
import styles from './FileMatchChildren.module.css'

interface FileMatchProps {
    result: ContentMatch
    grouped: MatchGroup[]
}

export const FileMatchChildren: FC<PropsWithChildren<FileMatchProps>> = props => {
    const { result, grouped } = props

    const createCodeExcerptLink = (group: MatchGroup): string => {
        const match = group.matches[0]
        return SourcegraphURL.from(getFileMatchUrl(result))
            .setLineRange({
                line: match.startLine + 1,
                character: match.startCharacter + 1,
                endLine: match.endLine + 1,
                endCharacter: match.endCharacter + 1,
            })
            .toString()
    }

    const navigateToFile = useCallback(
        (event: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>): void => {
            // navigateToCodeExcerpt(event, props.openInNewTab ?? false, navigate)
        },
        []
    )

    return (
        <div data-testid="file-match-children">
            {grouped.length > 0 &&
                grouped.map(group => (
                    <div
                        key={`linematch:${getFileMatchUrl(result)}${group.startLine}:${group.endLine}`}
                        role="link"
                        tabIndex={0}
                        data-href={createCodeExcerptLink(group)}
                        className={clsx(
                            'test-file-match-children-item',
                            styles.chunk,
                            resultStyles.clickable,
                            resultStyles.focusableBlock,
                            resultStyles.horizontalDividerBetween
                        )}
                        onClick={navigateToFile}
                        onKeyDown={navigateToFile}
                    >
                        <CodeExcerpt
                            commitID={result.commit || ''}
                            filePath={result.path}
                            startLine={group.startLine}
                            endLine={group.endLine}
                            highlightRanges={group.matches}
                            plaintextLines={group.plaintextLines}
                            highlightedLines={group.highlightedHTMLRows}
                        />
                    </div>
                ))}
        </div>
    )
}
