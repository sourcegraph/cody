import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import type { McpServer } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { DatabaseBackup, Search } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Input } from '../shadcn/ui/input'
import { cn } from '../shadcn/utils'
import type { ServerType } from './types'
import { ServersView } from './views/ServersView'

interface ServerHomeProps {
    api: WebviewToExtensionAPI
}
export function ServerHome({ api }: ServerHomeProps) {
    const [servers, setServers] = useState<ServerType[]>([])
    const [selectedServer, setSelectedServer] = useState<ServerType | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const _servers = useMemo((): ServerType[] => {
        const servers = useMcpSettings()
        if (!servers?.length) {
            return []
        }
        return servers?.map(s => ({
            id: s.name,
            name: s.name,
            tools: s.tools,
            status: 'online',
            icon: DatabaseBackup,
            type: 'mcp',
        }))
    }, [])

    if (!servers) {
        return <div>Loading...</div>
    }

    const addServers = useCallback(
        (server: ServerType) => {
            setServers([...servers, server])
        },
        [servers]
    )

    // Filter servers based on search query
    const filteredServers = useMemo(() => {
        if (_servers) {
            setServers(_servers)
        }
        return servers.filter(
            server =>
                server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                server.type.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [searchQuery, servers, _servers])

    return (
        <div className="tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-flex-grow">
            <div className="tw-flex tw-h-full tw-bg-background tw-transition-all tw-duration-300 tw-flex-col">
                <div className={cn('tw-flex-1 tw-overflow-auto')}>
                    <div className="tw-flex tw-items-center tw-px-4 tw-pb-4">
                        <div className="tw-w-full">
                            <div className="tw-flex tw-items-center tw-gap-4">
                                <div className="tw-relative tw-w-full">
                                    <Search className="tw-absolute tw-left-2 tw-h-auto tw-w-2 tw-text-muted-foreground" />
                                    <Input
                                        placeholder="Search..."
                                        className="tw-pl-8 tw-h-9 tw-bg-muted/50 tw-border-none"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <ServersView
                        servers={filteredServers}
                        selectedServer={selectedServer}
                        onSelectServer={setSelectedServer}
                        isSidebarView={false}
                        addServers={addServers}
                    />
                </div>
            </div>
        </div>
    )
}

function useMcpSettings(): McpServer[] | null {
    const settings = useExtensionAPI().mcpSettings
    const _observable = useObservable(useMemo(() => settings(), [settings]))?.value
    return _observable || null
}
