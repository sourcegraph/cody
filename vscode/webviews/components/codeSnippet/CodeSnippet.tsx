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
import VisibilitySensor from 'react-visibility-sensor'

import type {
    ChunkMatch,
    ContentMatch,
    HighlightLineRange,
    LineMatch,
    MatchGroup,
    SearchMatch,
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

import type { Observable } from 'observable-fns'
import styles from './CodeSnippet.module.css'

const DEFAULT_VISIBILITY_OFFSET = { bottom: -500 }

export interface FetchFileParameters {
    repoName: string
    commitID: string
    filePath: string
    disableTimeout: boolean
    ranges: HighlightLineRange[]
}

interface FileContentSearchResultProps {
    /** The file match search result. */
    result: ContentMatch

    /** Whether or not to show all matches for this file, or only a subset. */
    showAllMatches: boolean

    /** Whether this file should be rendered as expanded by default. */
    defaultExpanded: boolean

    /** The server endpoint URL base for building proper absulute link paths for blob snippets */
    serverEndpoint: string

    fetchHighlightedFileLineRanges?: (
        parameters: FetchFileParameters,
        force?: boolean
    ) => Observable<string[][]>

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
        serverEndpoint,
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
    const repoAtRevisionURL = getRepositoryUrl(serverEndpoint, result.repository, result.branches)
    const fileURL = getFileMatchUrl(serverEndpoint, result)
    const collapsedGroups = truncateGroups(expandedGroups, 5, 1)
    const expandedHighlightCount = countHighlightRanges(expandedGroups)
    const collapsedHighlightCount = countHighlightRanges(collapsedGroups)
    const hiddenMatchesCount = expandedHighlightCount - collapsedHighlightCount
    const expandable = !showAllMatches && expandedHighlightCount > collapsedHighlightCount

    useEffect(() => setExpanded(allExpanded || defaultExpanded), [allExpanded, defaultExpanded])

    const handleVisibility = useCallback(() => {
        if (hasBeenVisible || !fetchHighlightedFileLineRanges) {
            return
        }

        setHasBeenVisible(true)

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
                // Explicitly narrow the object otherwise we'll send a bunch of extra data in the request.
                ranges: unhighlightedGroups.map(({ startLine, endLine }) => ({ startLine, endLine })),
            },
            false
        ).subscribe(res => {
            setExpandedGroups(
                unhighlightedGroups.map((group, i) => ({
                    ...group,
                    highlightedHTMLRows: res[i],
                }))
            )
        })
    }, [fetchHighlightedFileLineRanges, hasBeenVisible, unhighlightedGroups, result])

    const toggleExpand = useCallback((): void => {
        if (expandable) {
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
    }, [expandable, expanded])

    const [hidden, setHidden] = useState(false)

    const title = (
        <RepoFileLink
            repoName={result.repository}
            repoURL={repoAtRevisionURL}
            filePath={result.path}
            pathMatchRanges={result.pathMatches ?? []}
            fileURL={fileURL}
            repoDisplayName={
                repoDisplayName
                    ? `${repoDisplayName}${revisionDisplayName ? `@${revisionDisplayName}` : ''}`
                    : undefined
            }
            className={styles.titleInner}
            collapsed={hidden}
            onToggleCollapse={() => setHidden(current => !current)}
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
            collapsed={hidden}
        >
            <VisibilitySensor
                partialVisibility={true}
                offset={DEFAULT_VISIBILITY_OFFSET}
                onChange={(visible: boolean) => visible && handleVisibility()}
            >
                <div data-expanded={expanded}>
                    <FileMatchChildren
                        serverEndpoint={serverEndpoint}
                        result={result}
                        grouped={expanded ? expandedGroups : collapsedGroups}
                    />
                    {expandable && (
                        <button
                            type="button"
                            className={clsx(
                                styles.toggleMatchesButton,
                                styles.focusableBlock,
                                styles.clickable,
                                { [styles.toggleMatchesButtonExpanded]: expanded }
                            )}
                            onClick={toggleExpand}
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
            </VisibilitySensor>
        </ResultContainer>
    )
}

interface ResultContainerProps {
    title: React.ReactNode
    titleClassName?: string
    resultClassName?: string
    repoStars?: number
    resultType?: SearchMatch['type']
    className?: string
    rankingDebug?: string
    actions?: ReactElement | boolean
    onResultClicked?: () => void
    collapsed: boolean
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
        collapsed,
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
                {children && !collapsed && (
                    <div className={clsx(styles.result, resultClassName)}>{children}</div>
                )}
            </article>
        </Component>
    )
})

function getRepositoryUrl(base: string, repository: string, branches?: string[]): string {
    const branch = branches?.[0]
    const revision = branch ? `@${branch}` : ''
    const label = repository + revision
    return base + encodeURI(label)
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
        startCharacter: range.start.character,
        endLine: range.end.line,
        endCharacter: range.end.character,
    }))
    const plaintextLines = chunk.content.replace(/\r?\n$/, '').split(/\r?\n/)
    return {
        plaintextLines,
        highlightedHTMLRows: undefined, // populated lazily
        matches,
        startLine: chunk.contentStart.line,
        endLine: chunk.contentStart.line + Math.max(plaintextLines.length, 1),
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
