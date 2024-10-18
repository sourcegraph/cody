import type * as React from 'react'
import { useEffect, useRef } from 'react'

import {
    type ContextItemOpenCtx,
    ContextItemSource,
    REMOTE_FILE_PROVIDER_URI,
} from '@sourcegraph/cody-shared'
import { ChevronDown, ChevronUp, EllipsisIcon, MessageSquareDiff, MessageSquarePlus } from 'lucide-react'
import { URI } from 'vscode-uri'
import { getCreateNewChatCommand } from '../../../tabs/utils'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { useConfig } from '../../../utils/useConfig'
import { Button } from '../../shadcn/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../../shadcn/ui/popover'
import { cn } from '../../shadcn/utils'
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
    onAddToFollowupChat?: (props: {
        repoName: string
        filePath: string
        fileURL: string
    }) => void
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
        onAddToFollowupChat,
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

    const config = useConfig()

    const addToNewChat = () => {
        const command = getCreateNewChatCommand({
            IDE: config.clientCapabilities.agentIDE,
            webviewType: config.config.webviewType,
            multipleWebviewsEnabled: config.config.multipleWebviewsEnabled,
        })

        getVSCodeAPI().postMessage({
            command: 'command',
            id: command,
            arg: JSON.stringify({
                contextItems: [
                    {
                        providerUri: REMOTE_FILE_PROVIDER_URI,
                        provider: 'openctx',
                        type: 'openctx',
                        uri: URI.parse(fileURL),
                        title: fileName,
                        description: filePath,
                        source: ContextItemSource.User,
                        mention: {
                            uri: fileURL,
                            description: filePath,
                            data: {
                                repoName,
                                filePath: filePath,
                            },
                        },
                    },
                ] satisfies ContextItemOpenCtx[],
            }),
        })
    }

    return (
        <span className={cn(className, 'tw-flex tw-justify-between tw-w-full')}>
            <span className="tw-flex-1">
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
            <div>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="!tw-w-auto !tw-justify-start tw-invisible group-hover:tw-visible"
                        >
                            <EllipsisIcon size="16" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="tw-max-w-[200px]" side="bottom" align="start">
                        <Button
                            variant="ghost"
                            className="!tw-justify-start tw-w-full"
                            onClick={() => onAddToFollowupChat?.({ repoName, filePath, fileURL })}
                        >
                            <MessageSquarePlus size="16" className="tw-mr-2" />
                            Add to follow up chat
                        </Button>
                        <Button
                            variant="ghost"
                            className="!tw-justify-start tw-w-full"
                            onClick={addToNewChat}
                        >
                            <MessageSquareDiff size="16" className="tw-mr-2" />
                            Add to new Cody chat
                        </Button>
                    </PopoverContent>
                </Popover>
            </div>
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
