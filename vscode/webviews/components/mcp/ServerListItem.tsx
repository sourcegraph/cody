import { DatabaseZap } from 'lucide-react'
import { Badge } from '../shadcn/ui/badge'
import { Button } from '../shadcn/ui/button'
import { cn } from '../shadcn/utils'
import type { ServerType } from './types'

interface ServerListItemProps {
    server: ServerType
    isActive: boolean
    onClick: () => void
}

export function ServerListItem({ server, isActive, onClick }: ServerListItemProps) {
    const ServerIcon = server.icon ?? DatabaseZap

    return (
        <Button
            className={cn(
                'tw-w-full tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-rounded-md tw-text-left',
                isActive
                    ? 'tw-bg-sidebar-accent tw-text-sidebar-accent-foreground'
                    : 'tw-hover:bg-sidebar-accent/50 tw-hover:text-sidebar-accent-foreground'
            )}
            onClick={onClick}
        >
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                <ServerIcon className="tw-h-4 tw-w-4 tw-shrink-0" />
                <span className="tw-truncate">{server.name}</span>
            </div>
            <Badge variant="info" className="tw-ml-2 tw-shrink-0">
                {server.status}
            </Badge>
        </Button>
    )
}
