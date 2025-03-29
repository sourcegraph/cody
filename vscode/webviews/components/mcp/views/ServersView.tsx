import { Server } from 'lucide-react'
import { ServerCard } from '../ServerCard'
import { AddServerDialog } from '../dialogs/AddServerDialog'
import type { ServerType } from '../types'
import { ServerDetailView } from './ServerDetailView'

interface ServersViewProps {
    servers: ServerType[]
    selectedServer: ServerType | null
    onSelectServer: (server: ServerType) => void
    addServers: (server: ServerType) => void
    isSidebarView: boolean
}

export function ServersView({
    servers,
    selectedServer,
    onSelectServer,
    addServers,
    isSidebarView,
}: ServersViewProps) {
    if (selectedServer) {
        return <ServerDetailView server={selectedServer} />
    }

    return (
        <div className="tw-flex tw-flex-col tw-gap-4 tw-p-4 tw-w-full">
            <h2 className="tw-text-2xl tw-font-bold tw-mb-6">MCP Servers</h2>
            {/* <p>
                This configuration file tells Claude for Desktop which MCP servers to start up every time
                you start the application.
            </p> */}
            <div className="tw-w-full tw-grid tw-grid-cols-2 md:tw-grid-cols-3 lg:tw-grid-cols-4 tw-gap-4">
                {servers.map(server => (
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
            <AddServerDialog onAddServer={addServers} className="tw-mt-4 tw-w-full" />
        </div>
    )
}
