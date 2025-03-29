import { Server } from 'lucide-react'
import { ServerCard } from '../ServerCard'
import type { ServerType } from '../types'
import { AddServerView } from './AddServerView'
import { ServerDetailView } from './ServerDetailView'

interface ServersViewProps {
    servers: ServerType[]
    selectedServer: ServerType | null
    onSelectServer: (server: ServerType) => void
    addServers: (server: ServerType) => void
}

export function ServersView({ servers, selectedServer, onSelectServer, addServers }: ServersViewProps) {
    if (selectedServer) {
        return <ServerDetailView server={selectedServer} onAddServer={addServers} />
    }

    return (
        <div className="tw-flex tw-flex-col tw-gap-4 tw-p-4 tw-w-full">
            <h3 className="tw-text-xl tw-font-bold tw-mb-6">MCP Servers</h3>
            <div className="tw-w-full tw-grid tw-grid-cols-2 md:tw-grid-cols-3 lg:tw-grid-cols-4 tw-gap-4">
                {servers?.map(server => (
                    <ServerCard key={server.id} server={server} onClick={() => onSelectServer(server)} />
                ))}

                {servers.length === 0 && (
                    <div className="tw-w-full tw-col-span-full tw-text-center tw-py-12 tw-border tw-rounded-lg tw-border-dashed">
                        <Server className="tw-h-12 tw-w-12 tw-mx-auto tw-mb-4 tw-text-muted-foreground" />
                        <h3 className="tw-text-md tw-font-medium">No servers found</h3>
                        <p className="tw-text-muted-foreground tw-mt-1">
                            Add a new server to get started
                        </p>
                    </div>
                )}
            </div>
            <AddServerView onAddServer={addServers} className="tw-mt-4 tw-w-full" />
        </div>
    )
}
