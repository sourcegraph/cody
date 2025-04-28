import { DatabaseZap, PowerOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { Badge } from '../shadcn/ui/badge'
import { Button } from '../shadcn/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../shadcn/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/ui/popover'
import type { ServerType } from './types'

interface ServerCardProps {
    server: ServerType
    onClick: () => void
}

export function ServerCard({ server, onClick }: ServerCardProps) {
    const ServerIcon = server.icon ?? DatabaseZap
    const [showAllTags, setShowAllTags] = useState(false)
    const maxVisibleTags = 3
    const hasMoreTags = server.tools && server.tools.length > maxVisibleTags
    return (
        <Card
            className="tw-overflow-hidden tw-hover:border-primary/50 tw-transition-colors tw-cursor-pointer"
            onClick={e => {
                // Don't trigger the card click when clicking on the tags expansion
                if ((e.target as HTMLElement).closest('[data-tag-expansion]')) {
                    e.stopPropagation()
                    return
                }
                onClick()
            }}
        >
            <CardHeader className="tw-p-2 tw-m-2">
                <div className="tw-flex tw-justify-between tw-items-start">
                    <div className="tw-flex tw-items-center tw-gap-2">
                        <div className="tw-p-1.5 tw-rounded-md tw-bg-primary/10">
                            <ServerIcon className="tw-h-full tw-text-primary" />
                        </div>
                        <CardTitle className="tw-text-base tw-text-md">{server.name}</CardTitle>
                    </div>
                    <Badge
                        variant={
                            server.status === 'online'
                                ? 'success'
                                : server.status === 'disabled'
                                  ? 'secondary'
                                  : 'error'
                        }
                        className="tw-whitespace-nowrap tw-overflow-hidden tw-ring-1 tw-ring-inset"
                    >
                        {server.status}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="tw-flex tw-align-top tw-justify-between tw-my-1 tw-flex-wrap">
                    {server.tools && server.tools?.length > 0 && (
                        <div className="tw-mt-2">
                            <div className="tw-flex tw-flex-wrap tw-gap-4">
                                {server.tools.slice(0, maxVisibleTags).map(t => (
                                    <Badge
                                        variant="ghost"
                                        key={t.name}
                                        className="tw-truncate tw-max-w-[250px] tw-text-foreground"
                                        title={t.description}
                                    >
                                        {t.name}
                                    </Badge>
                                ))}

                                {hasMoreTags && (
                                    <TagsPopover
                                        tags={server.tools.map(t => t.name)}
                                        visibleCount={maxVisibleTags}
                                        showAllTags={showAllTags}
                                        setShowAllTags={setShowAllTags}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="tw-flex tw-justify-end tw-gap-2 tw-mt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="tw-h-8 tw-px-2"
                        onClick={e => {
                            e.stopPropagation()
                            getVSCodeAPI()?.postMessage({
                                command: 'mcp',
                                type: 'removeServer',
                                name: server.name,
                            })
                        }}
                        title={server.status === 'disabled' ? 'Enable server' : 'Disable server'}
                    >
                        <PowerOff size={16} className="tw-mr-1" />
                        {server.status === 'disabled' ? 'Enable' : 'Disable'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="tw-h-8 tw-px-2 tw-text-destructive hover:tw-bg-destructive/10 tw-z-10"
                        onClick={e => {
                            e.stopPropagation()
                            getVSCodeAPI()?.postMessage({
                                command: 'mcp',
                                type: 'removeServer',
                                name: server.name,
                            })
                        }}
                        title="Delete server"
                    >
                        <Trash2 size={16} className="tw-mr-1" />
                        Delete
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

interface TagsPopoverProps {
    tags: string[]
    visibleCount: number
    showAllTags: boolean
    setShowAllTags: (show: boolean) => void
}

function TagsPopover({ tags, visibleCount, showAllTags, setShowAllTags }: TagsPopoverProps) {
    const remainingCount = tags.length - visibleCount

    return (
        <Popover open={showAllTags} onOpenChange={setShowAllTags}>
            <PopoverTrigger asChild>
                <Badge
                    variant="ghost"
                    className="text-xs px-1.5 py-0 cursor-pointer hover:bg-secondary/80"
                    data-tag-expansion="true"
                >
                    +{remainingCount} more
                </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
                <div className="text-sm font-medium mb-1.5">All Tags</div>
                <div className="flex flex-wrap gap-1.5 max-w-[300px]">
                    {tags.map(tag => (
                        <Badge key={tag} variant="ghost" className="text-xs">
                            {tag}
                        </Badge>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    )
}
