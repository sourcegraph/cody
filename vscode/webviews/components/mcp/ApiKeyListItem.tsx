import { Key } from 'lucide-react'
import type { ApiKey } from './types'

interface ApiKeyListItemProps {
    apiKey: ApiKey
}

export function ApiKeyListItem({ apiKey }: ApiKeyListItemProps) {
    return (
        <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-rounded-md tw-hover:bg-sidebar-accent/50">
            <div className="tw-flex tw-items-center tw-gap-2 tw-overflow-hidden">
                <Key className="tw-h-4 tw-w-4 tw-shrink-0" />
                <span className="tw-truncate">{apiKey.name}</span>
            </div>
            <span className="tw-text-xs tw-text-muted-foreground tw-shrink-0">{apiKey.created}</span>
        </div>
    )
}
