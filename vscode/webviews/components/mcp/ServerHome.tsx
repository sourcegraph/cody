import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
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

    // Handle messages from the extension
    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data

            if (message.type === 'clientAction') {
                if (message.mcpServerAdded) {
                    // Server was successfully added
                    toast(`${message.mcpServerAdded.name} has been connected successfully.`)
                } else if (message.mcpServerError) {
                    // Error adding server
                    toast(message.mcpServerError.error || 'Failed to add server')

                    // Remove the server from the UI if it was added optimistically
                    if (message.mcpServerError.name) {
                        setServers(prevServers =>
                            prevServers.filter(s => s.name !== message.mcpServerError?.name)
                        )
                    }
                }
            }
        }

        window.addEventListener('message', messageHandler)
        return () => window.removeEventListener('message', messageHandler)
    }, [])

    if (!servers) {
        return <div>Loading...</div>
    }

    const addServers = useCallback(
        (server: ServerType) => {
            // Transform the UI server type to the format expected by MCPManager
            const mcpServerConfig: Record<string, any> = {
                transportType: server.url ? 'sse' : 'stdio',
            }

            // Add URL if it exists (for SSE transport)
            if (server.url) {
                mcpServerConfig.url = server.url
            }

            // Add command and args (for stdio transport)
            if (server.command) {
                mcpServerConfig.command = server.command

                // Only add non-empty args
                if (server.args && server.args.length > 0) {
                    mcpServerConfig.args = server.args.filter(arg => arg.trim() !== '')
                }
            }

            // Add environment variables if they exist
            if (server.env && server.env.length > 0) {
                const envVars: Record<string, string> = {}
                for (const env of server.env) {
                    if (env.name.trim() !== '') {
                        envVars[env.name] = env.value
                    }
                }

                // Only add if there are actual env vars
                if (Object.keys(envVars).length > 0) {
                    mcpServerConfig.env = envVars
                }
            }

            // Use extension API to add the server
            getVSCodeAPI().postMessage({
                command: 'mcp',
                type: 'addServer',
                name: server.name,
                config: mcpServerConfig,
            })

            // Optimistically add to UI state
            setServers([...servers, server])

            // Show toast notification
            toast(`${server.name} has been added. Connecting...`)
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
