import type * as React from 'react'
import { useEffect, useRef } from 'react'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { highlightNode } from '../highlights'
import type { Range } from '../types'

interface Props {
    repoName: string
    repoURL: string
    filePath: string
    pathMatchRanges?: Range[]
    fileURL: string
    repoDisplayName?: string
    className?: string
    isKeyboardSelectable?: boolean
    collapsed: boolean
    onToggleCollapse: () => void
}

/**
 * A link to a repository or a file within a repository, formatted as "repo" or "repo > file". Unless you
 * absolutely need breadcrumb-like behavior, use this instead of FilePathBreadcrumb.
 */
export const RepoFileLink: React.FunctionComponent<React.PropsWithChildren<Props>> = props => {
    const {
        repoDisplayName,
        repoName,
        repoURL,
        filePath,
        pathMatchRanges,
        fileURL,
        className,
        isKeyboardSelectable,
        collapsed,
        onToggleCollapse,
    } = props

    const [fileBase, fileName] = splitPath(filePath)
    const containerElement = useRef<HTMLAnchorElement>(null)

    useEffect((): void => {
        if (containerElement.current && pathMatchRanges && fileName) {
            for (const range of pathMatchRanges) {
                highlightNode(
                    containerElement.current as HTMLElement,
                    range.start.character,
                    range.end.character - range.start.character
                )
            }
        }
    }, [pathMatchRanges, fileName])

    return (
        <span className={className}>
            <span>
                {collapsed ? (
                    <ChevronDown
                        size={16}
                        className="tw-inline-block tw-mr-2 tw-cursor-pointer"
                        onClick={onToggleCollapse}
                    />
                ) : (
                    <ChevronUp
                        size={16}
                        className="tw-inline-block tw-mr-2 tw-cursor-pointer"
                        onClick={onToggleCollapse}
                    />
                )}
                <a href={repoURL} target="_blank" rel="noreferrer">
                    {repoDisplayName || displayRepoName(repoName)}
                </a>
                <span aria-hidden={true}> ›</span>{' '}
                <a
                    href={fileURL}
                    ref={containerElement}
                    target="_blank"
                    rel="noreferrer"
                    data-selectable-search-result={isKeyboardSelectable}
                >
                    {fileBase ? `${fileBase}/` : null}
                    <strong>{fileName}</strong>
                </a>
            </span>
        </span>
    )
}

/**
 * Returns the friendly display form of the repository name (e.g., removing "github.com/").
 */
function displayRepoName(repoName: string): string {
    let parts = repoName.split('/')
    if (parts.length > 1 && parts[0].includes('.')) {
        parts = parts.slice(1) // remove hostname from repo name (reduce visual noise)
    }
    return parts.join('/')
}

/**
 * Splits the repository name into the dir and base components.
 */
function splitPath(path: string): [string, string] {
    const components = path.split('/')
    return [components.slice(0, -1).join('/'), components.at(-1)!]
}
