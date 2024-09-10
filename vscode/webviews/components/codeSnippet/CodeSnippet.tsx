import {
    type ElementType,
    type FC,
    type PropsWithChildren,
    type ReactElement,
    forwardRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'

import { clsx } from 'clsx'

import {
    type ChunkMatch,
    type ContentMatch,
    type HighlightLineRange,
    HighlightResponseFormat,
    type LineMatch,
    type MatchGroup,
    type SearchMatch,
} from './types'

import { FileMatchChildren } from './components/FileMatchChildren'
import { RepoFileLink } from './components/RepoLink'
import {
    type ForwardReferenceExoticComponent,
    formatRepositoryStarCount,
    getFileMatchUrl,
    getRevision,
    pluralize,
} from './utils'

import styles from './CodeSnippet.module.css'

export interface FetchFileParameters {
    repoName: string
    commitID: string
    filePath: string
    disableTimeout?: boolean
    ranges: HighlightLineRange[]
    format?: HighlightResponseFormat
}

interface FileContentSearchResultProps {
    /** The file match search result. */
    result: ContentMatch

    /** Whether or not to show all matches for this file, or only a subset. */
    showAllMatches: boolean

    /** Whether this file should be rendered as expanded by default. */
    defaultExpanded: boolean

    fetchHighlightedFileLineRanges?: (
        parameters: FetchFileParameters,
        force?: boolean
    ) => Promise<string[][]>

    /**
     * Formatted repository name to be displayed in repository link. If not
     * provided, the default format will be displayed.
     */
    repoDisplayName?: string

    allExpanded?: boolean

    /** CSS class name to be applied to the ResultContainer Component. */
    className?: string

    /** Called when the file's search result is selected. */
    onSelect: () => void
}

export const FileContentSearchResult: FC<PropsWithChildren<FileContentSearchResultProps>> = props => {
    const {
        className,
        result,
        repoDisplayName,
        defaultExpanded,
        allExpanded,
        showAllMatches,
        fetchHighlightedFileLineRanges,
        onSelect,
    } = props

    const unhighlightedGroups: MatchGroup[] = useMemo(() => matchesToMatchGroups(result), [result])

    // Refs element
    const rootRef = useRef<HTMLDivElement>(null)

    // States
    const [expanded, setExpanded] = useState(allExpanded || defaultExpanded)
    const [hasBeenVisible, setHasBeenVisible] = useState(false)
    const [expandedGroups, setExpandedGroups] = useState(unhighlightedGroups)

    // Calculated state
    const revisionDisplayName = getRevision(result.branches, result.commit)
    const repoAtRevisionURL = getRepositoryUrl(result.repository, result.branches)
    const collapsedGroups = truncateGroups(expandedGroups, 5, 1)
    const expandedHighlightCount = countHighlightRanges(expandedGroups)
    const collapsedHighlightCount = countHighlightRanges(collapsedGroups)
    const hiddenMatchesCount = expandedHighlightCount - collapsedHighlightCount
    const collapsible = !showAllMatches && expandedHighlightCount > collapsedHighlightCount

    useEffect(() => setExpanded(allExpanded || defaultExpanded), [allExpanded, defaultExpanded])

    useEffect(() => {
        const hasHighlighting = unhighlightedGroups.some(group => group.highlightedHTMLRows)

        if (hasHighlighting || !fetchHighlightedFileLineRanges) {
            return
        }

        // This file contains some large lines, avoid stressing
        // syntax-highlighter and the browser.
        if (result.chunkMatches?.some(chunk => chunk.contentTruncated)) {
            return
        }

        fetchHighlightedFileLineRanges(
            {
                repoName: result.repository,
                commitID: result.commit || '',
                filePath: result.path,
                disableTimeout: false,
                format: HighlightResponseFormat.HTML_HIGHLIGHT,
                // Explicitly narrow the object otherwise we'll send a bunch of extra data in the request.
                ranges: unhighlightedGroups.map(({ startLine, endLine }) => ({ startLine, endLine })),
            },
            false
        ).then(res => {
            setExpandedGroups(
                unhighlightedGroups.map((group, i) => ({
                    ...group,
                    highlightedHTMLRows: res[i],
                }))
            )
        })
    }, [result, fetchHighlightedFileLineRanges, unhighlightedGroups])

    const toggle = useCallback((): void => {
        if (collapsible) {
            setExpanded(expanded => !expanded)
        }

        // Scroll back to top of result when collapsing
        if (expanded) {
            setTimeout(() => {
                const reducedMotion = !window.matchMedia('(prefers-reduced-motion: no-preference)')
                    .matches
                rootRef.current?.scrollIntoView({
                    block: 'nearest',
                    behavior: reducedMotion ? 'auto' : 'smooth',
                })
            }, 0)
        }
    }, [collapsible, expanded])

    const title = (
        <RepoFileLink
            repoName={result.repository}
            repoURL={repoAtRevisionURL}
            filePath={result.path}
            pathMatchRanges={result.pathMatches ?? []}
            fileURL={getFileMatchUrl(result)}
            repoDisplayName={
                repoDisplayName
                    ? `${repoDisplayName}${revisionDisplayName ? `@${revisionDisplayName}` : ''}`
                    : undefined
            }
            className={styles.titleInner}
        />
    )

    return (
        <ResultContainer
            ref={rootRef}
            title={title}
            resultType={result.type}
            onResultClicked={onSelect}
            repoStars={result.repoStars}
            className={className}
            rankingDebug={result.debug}
            repoLastFetched={result.repoLastFetched}
        >
            <div data-testid="file-search-result" data-expanded={expanded}>
                <FileMatchChildren
                    result={result}
                    grouped={expanded ? expandedGroups : collapsedGroups}
                />
                {collapsible && (
                    <button
                        type="button"
                        className={clsx(
                            styles.toggleMatchesButton,
                            styles.focusableBlock,
                            styles.clickable,
                            { [styles.toggleMatchesButtonExpanded]: expanded }
                        )}
                        onClick={toggle}
                    >
                        <span className={styles.toggleMatchesButtonText}>
                            {expanded
                                ? 'Show less'
                                : `Show ${hiddenMatchesCount} more ${pluralize(
                                      'match',
                                      hiddenMatchesCount,
                                      'matches'
                                  )}`}
                        </span>
                    </button>
                )}
            </div>
        </ResultContainer>
    )
}

export interface ResultContainerProps {
    title: React.ReactNode
    titleClassName?: string
    resultClassName?: string
    repoStars?: number
    resultType?: SearchMatch['type']
    className?: string
    rankingDebug?: string
    actions?: ReactElement | boolean
    onResultClicked?: () => void
}

const accessibleResultType: Record<SearchMatch['type'], string> = {
    content: 'file content',
}

const ResultContainer: ForwardReferenceExoticComponent<
    ElementType,
    PropsWithChildren<ResultContainerProps>
> = forwardRef(function ResultContainer(props, reference) {
    const {
        children,
        title,
        titleClassName,
        resultClassName,
        repoStars,
        resultType,
        className,
        rankingDebug,
        actions,
        as: Component = 'div',
        onResultClicked,
    } = props

    const formattedRepositoryStarCount = formatRepositoryStarCount(repoStars)

    return (
        <Component
            ref={reference}
            className={clsx(className, styles.resultContainer)}
            onClick={onResultClicked}
        >
            <article>
                <header className={styles.header} data-result-header={true}>
                    {/* Add a result type to be read out to screen readers only, so that screen reader users can
                    easily scan the search results list (for example, by navigating by landmarks). */}
                    <span className="sr-only">
                        {resultType ? accessibleResultType[resultType] : 'search'} result,
                    </span>
                    <div className={clsx(styles.headerTitle, titleClassName)}>{title}</div>

                    {actions}
                    {formattedRepositoryStarCount && (
                        <span className="d-flex align-items-center">
                            <span aria-hidden={true}>{formattedRepositoryStarCount}</span>
                        </span>
                    )}
                </header>
                {rankingDebug && <div>{rankingDebug}</div>}
                {children && <div className={clsx(styles.result, resultClassName)}>{children}</div>}
            </article>
        </Component>
    )
})

function getRepositoryUrl(repository: string, branches?: string[]): string {
    const branch = branches?.[0]
    const revision = branch ? `@${branch}` : ''
    const label = repository + revision
    return '/' + encodeURI(label)
}

function countHighlightRanges(groups: MatchGroup[]): number {
    return groups.reduce((count, group) => count + group.matches.length, 0)
}

function matchesToMatchGroups(result: ContentMatch): MatchGroup[] {
    return [
        ...(result.lineMatches?.map(lineToMatchGroup) ?? []),
        ...(result.chunkMatches?.map(chunkToMatchGroup) ?? []),
    ]
}

function chunkToMatchGroup(chunk: ChunkMatch): MatchGroup {
    const matches = chunk.ranges.map(range => ({
        startLine: range.start.line,
        startCharacter: range.start.column,
        endLine: range.end.line,
        endCharacter: range.end.column,
    }))
    const plaintextLines = chunk.content.replace(/\r?\n$/, '').split(/\r?\n/)
    return {
        plaintextLines,
        highlightedHTMLRows: undefined, // populated lazily
        matches,
        startLine: chunk.contentStart.line,
        endLine: chunk.contentStart.line + plaintextLines.length,
    }
}

function lineToMatchGroup(line: LineMatch): MatchGroup {
    const matches = line.offsetAndLengths.map(offsetAndLength => ({
        startLine: line.lineNumber,
        startCharacter: offsetAndLength[0],
        endLine: line.lineNumber,
        endCharacter: offsetAndLength[0] + offsetAndLength[1],
    }))
    return {
        plaintextLines: [line.line],
        highlightedHTMLRows: undefined, // populated lazily
        matches,
        startLine: line.lineNumber,
        endLine: line.lineNumber + 1, // the matches support `endLine` == `startLine`, but MatchGroup requires `endLine` > `startLine`
    }
}

function truncateGroups(groups: MatchGroup[], maxMatches: number, contextLines: number): MatchGroup[] {
    const visibleGroups = []
    let remainingMatches = maxMatches
    for (const group of groups) {
        if (remainingMatches === 0) {
            break
        }

        if (group.matches.length > remainingMatches) {
            visibleGroups.push(truncateGroup(group, remainingMatches, contextLines))
            break
        }

        visibleGroups.push(group)
        remainingMatches -= group.matches.length
    }

    return visibleGroups
}

function truncateGroup(group: MatchGroup, maxMatches: number, contextLines: number): MatchGroup {
    const keepMatches = group.matches.slice(0, maxMatches)
    const newStartLine = Math.max(
        Math.min(...keepMatches.map(match => match.startLine)) - contextLines,
        group.startLine
    )
    const newEndLine = Math.min(
        Math.max(...keepMatches.map(match => match.endLine)) + contextLines,
        group.endLine
    )
    const matchesInKeepContext = group.matches
        .slice(maxMatches)
        .filter(match => match.startLine >= newStartLine && match.endLine <= newEndLine)
    return {
        ...group,
        plaintextLines: group.plaintextLines.slice(
            newStartLine - group.startLine,
            newEndLine - group.startLine + 1
        ),
        highlightedHTMLRows: group.highlightedHTMLRows?.slice(
            newStartLine - group.startLine,
            newEndLine - group.startLine + 1
        ),
        matches: [...keepMatches, ...matchesInKeepContext],
        startLine: newStartLine,
        endLine: newEndLine,
    }
}
