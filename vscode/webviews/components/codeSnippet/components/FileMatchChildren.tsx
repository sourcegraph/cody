import { type FC, type PropsWithChildren, useCallback } from 'react'

import { clsx } from 'clsx'

import type { MatchGroup } from '../types'
import { SourcegraphURL } from '../url'
import { getFileMatchUrl } from '../utils'

import { CodeExcerpt } from './CodeExcerpt'

import { CodyIDE } from '@sourcegraph/cody-shared'
import type { NLSSearchFileMatch } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { useConfig } from '../../../utils/useConfig'
import resultStyles from '../CodeSnippet.module.css'
import styles from './FileMatchChildren.module.css'

interface FileMatchProps {
    result: NLSSearchFileMatch
    grouped: MatchGroup[]
    serverEndpoint: string
    onLineClick?: () => void
}

export const FileMatchChildren: FC<PropsWithChildren<FileMatchProps>> = props => {
    const { result, grouped, serverEndpoint, onLineClick } = props

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

    const {
        clientCapabilities: { agentIDE },
    } = useConfig()

    const navigateToFile = useCallback(
        (line: number) => {
            if (agentIDE === CodyIDE.VSCode && onLineClick) {
                onLineClick()
                return
            }

            // TODO: this does not work on web as opening links from within a web worker does not work.
            getVSCodeAPI().postMessage({
                command: 'links',
                value: `${getFileMatchUrl(serverEndpoint, result)}?L${line}`,
            })
        },
        [serverEndpoint, result, onLineClick, agentIDE]
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
                            commitID={result.file.commit?.oid || ''}
                            filePath={result.file.path}
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
