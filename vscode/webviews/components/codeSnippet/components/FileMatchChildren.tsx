import { useCallback, type KeyboardEvent, type MouseEvent } from 'react'

import { clsx } from 'clsx'

import { SourcegraphURL } from '../url'
import type { MatchGroup, ContentMatch } from '../types'
import { getFileMatchUrl } from '../utils'

import { CodeExcerpt } from './CodeExcerpt'

import styles from './FileMatchChildren.module.css'
import resultStyles from '../CodeSnippet.module.css'

interface FileMatchProps {
    result: ContentMatch
    grouped: MatchGroup[]
}

export const FileMatchChildren: React.FunctionComponent<React.PropsWithChildren<FileMatchProps>> = props => {
    const { result, grouped} = props

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

    // const navigate = useNavigate()
    const navigateToFile = useCallback(
        (event: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>): void => {
            // navigateToCodeExcerpt(event, props.openInNewTab ?? false, navigate)
        },
        []
    )

    return (
        <div data-testid="file-match-children" data-selectable-search-results-group="true">
            {grouped.length > 0 &&
                grouped.map(group => (
                    <div
                        key={`linematch:${getFileMatchUrl(result)}${group.startLine}:${group.endLine}`}
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
                        data-testid="file-match-children-item"
                        tabIndex={0}
                        role="link"
                        data-selectable-search-result="true"
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
