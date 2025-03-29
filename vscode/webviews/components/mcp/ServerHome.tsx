import { Search } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Input } from '../shadcn/ui/input'
import { cn } from '../shadcn/utils'
import type { ServerType } from './types'
import { ServersView } from './views/ServersView'

interface ServerHomeProps {
    mcpServers?: ServerType[]
}
export function ServerHome({ mcpServers = [] }: ServerHomeProps) {
    const [servers, setServers] = useState<ServerType[]>([])
    const [selectedServer, setSelectedServer] = useState<ServerType | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

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
        if (mcpServers) {
            setServers(mcpServers)
        }
        return servers.filter(
            server =>
                server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                server.type.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [searchQuery, servers, mcpServers])
    return (
        <div className="tw-flex tw-flex-col tw-gap-4 tw-flex-grow tw-overflow-y-scroll">
            <div className="tw-flex tw-h-full tw-transition-all tw-duration-300 tw-flex-col">
                <div className={cn('tw-flex-1 tw-overflow-auto')}>
                    <div className="tw-flex tw-items-center tw-p-6">
                        <div className="tw-w-full">
                            <div className="tw-flex tw-items-center tw-gap-4">
                                <div className="tw-relative tw-w-full">
                                    <Search className="tw-absolute tw-left-2 tw-h-auto tw-w-2 tw-text-muted-foreground" />
                                    <Input
                                        placeholder="Search..."
                                        className="tw-p-2 tw-h-9 tw-bg-muted/50 tw-border-none"
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
                        addServers={addServers}
                    />
                </div>
            </div>
        </div>
    )
}
