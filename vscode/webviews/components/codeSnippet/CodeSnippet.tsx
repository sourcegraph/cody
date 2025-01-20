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

import type { ChunkMatch, HighlightLineRange, MatchGroup, SearchMatch } from './types'

import { FileMatchChildren } from './components/FileMatchChildren'
import { RepoFileLink } from './components/RepoLink'
import {
    type ForwardReferenceExoticComponent,
    formatRepositoryStarCount,
    getRevision,
    pluralize,
} from './utils'

import { CodyIDE } from '@sourcegraph/cody-shared'
import type {
    NLSSearchFileMatch,
    NLSSearchResult,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import type { Observable } from 'observable-fns'
import { useInView } from 'react-intersection-observer'
import { URI } from 'vscode-uri'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { useConfig } from '../../utils/useConfig'
import styles from './CodeSnippet.module.css'

const DEFAULT_VISIBILITY_OFFSET = '500px'

export interface ISelectableForContext {
    /** Whether the result is selected for context for the next chat. */
    selectedForContext: boolean
    /**
     * Called when the result is selected for context for the next chat.
     *
     * If not present the component should not present a way to select the result for context.
     */
    onSelectForContext?: (selected: boolean, result: NLSSearchResult) => void
}

export interface FetchFileParameters {
    repoName: string
    commitID: string
    filePath: string
    disableTimeout: boolean
    ranges: HighlightLineRange[]
}

interface FileMatchSearchResultProps extends ISelectableForContext {
    /** The file match search result. */
    result: NLSSearchFileMatch

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

export const FileMatchSearchResult: FC<PropsWithChildren<FileMatchSearchResultProps>> = props => {
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
        selectedForContext,
        onSelectForContext,
    } = props

    const unhighlightedGroups: MatchGroup[] = useMemo(() => matchesToMatchGroups(result), [result])

    // Refs element
    const rootRef = useRef<HTMLDivElement>(null)

    // States
    const [expanded, setExpanded] = useState(allExpanded || defaultExpanded)
    const [expandedGroups, setExpandedGroups] = useState(unhighlightedGroups)

    // Calculated state
    const revisionDisplayName = getRevision([], result.file.commit.oid)
    const repoAtRevisionURL = getRepositoryUrl(serverEndpoint, result.repository.name, [
        result.file.commit.oid,
    ])
    const fileURL = serverEndpoint + result.file.url
    const collapsedGroups = truncateGroups(expandedGroups, 1, 1)
    const expandedHighlightCount = countHighlightRanges(expandedGroups)
    const collapsedHighlightCount = countHighlightRanges(collapsedGroups)
    const hiddenMatchesCount = expandedHighlightCount - collapsedHighlightCount
    const expandable = !showAllMatches && expandedHighlightCount > collapsedHighlightCount

    useEffect(() => setExpanded(allExpanded || defaultExpanded), [allExpanded, defaultExpanded])
    const {
        clientCapabilities: { agentIDE },
    } = useConfig()
    const openRemoteFile = useCallback(
        (line?: number) => {
            // Call the "onSelect" callback when opening a remote file to log
            // an event for interacting with the search result.
            onSelect()
            const urlWithLineNumber = line ? `${fileURL}?L${line}` : fileURL
            if (agentIDE !== CodyIDE.VSCode) {
                getVSCodeAPI().postMessage({
                    command: 'links',
                    value: urlWithLineNumber,
                })

                return
            }

            const uri = URI.parse(urlWithLineNumber)
            getVSCodeAPI().postMessage({
                command: 'openRemoteFile',
                uri,
            })
        },
        [fileURL, agentIDE, onSelect]
    )

    const handleVisibility = useCallback(
        (inView: boolean, entry: IntersectionObserverEntry) => {
            if (!inView) {
                return
            }
            if (!fetchHighlightedFileLineRanges) {
                return
            }

            fetchHighlightedFileLineRanges(
                {
                    repoName: result.repository.name,
                    commitID: result.file.commit.oid || '',
                    filePath: result.file.path,
                    disableTimeout: false,
                    // Explicitly narrow the object otherwise we'll send a bunch of extra data in the request.
                    ranges: unhighlightedGroups.map(({ startLine, endLine }) => ({
                        startLine,
                        endLine,
                    })),
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
        },
        [fetchHighlightedFileLineRanges, unhighlightedGroups, result]
    )

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
            repoName={result.repository.name}
            repoURL={repoAtRevisionURL}
            filePath={result.file.path}
            onFilePathClick={() => openRemoteFile(expandedGroups.at(0)?.startLine)}
            pathMatchRanges={result.pathMatches ?? []}
            fileURL={fileURL}
            repoDisplayName={
                repoDisplayName
                    ? `${repoDisplayName}${revisionDisplayName ? `@${revisionDisplayName}` : ''}`
                    : undefined
            }
            className={styles.titleInner}
            collapsed={hidden}
            collapsible={!!unhighlightedGroups?.length}
            onToggleCollapse={() => setHidden(current => !current)}
        />
    )

    const [ref] = useInView({
        rootMargin: `0px 0px ${DEFAULT_VISIBILITY_OFFSET} 0px`,
        onChange: handleVisibility,
        threshold: 0,
        triggerOnce: true,
    })

    const actions = onSelectForContext ? (
        <div>
            <label htmlFor="search-results.select-all">
                <input
                    type="checkbox"
                    id="search-results.select-all"
                    checked={selectedForContext}
                    onChange={event => {
                        onSelectForContext?.(event.target.checked, result)
                    }}
                    title="Select for context"
                    aria-label="Select for context"
                />
                Select for context
            </label>
        </div>
    ) : null

    return (
        <ResultContainer
            ref={rootRef}
            title={title}
            className={className}
            collapsed={hidden}
            actions={actions}
        >
            <div ref={ref} data-expanded={expanded}>
                <FileMatchChildren
                    serverEndpoint={serverEndpoint}
                    result={result}
                    grouped={expanded ? expandedGroups : collapsedGroups}
                    onLineClick={openRemoteFile}
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
    actions?: ReactElement | null
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
            className={clsx(className, styles.resultContainer, 'tw-group')}
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

                    {formattedRepositoryStarCount && (
                        <span className="d-flex align-items-center">
                            <span aria-hidden={true}>{formattedRepositoryStarCount}</span>
                        </span>
                    )}
                    {actions}
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

function matchesToMatchGroups(result: NLSSearchFileMatch): MatchGroup[] {
    return [
        ...(result.chunkMatches?.map(chunkToMatchGroup) ?? []),
        ...(result.symbols?.map(symbolToMatchGroup) ?? []),
    ]
}

function symbolToMatchGroup(chunk: NonNullable<NLSSearchFileMatch['symbols']>[0]): MatchGroup {
    const range = chunk.location.range
    const matches = [
        {
            startLine: range.start.line,
            startCharacter: range.start.character,
            endLine: range.end.line,
            endCharacter: range.end.character,
        },
    ]
    const plaintextLines = [chunk.name]
    return {
        plaintextLines,
        highlightedHTMLRows: undefined, // populated lazily
        matches,
        startLine: chunk.location.range.start.line,
        endLine: chunk.location.range.end.line + Math.max(plaintextLines.length, 1),
    }
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
