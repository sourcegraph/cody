import { PlugZapIcon, Server, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { Badge } from '../shadcn/ui/badge'
import { Button } from '../shadcn/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '../shadcn/ui/command'
import type { ServerType } from './types'
import { AddServerView } from './views/AddServerView'

interface ServerHomeProps {
    mcpServers?: ServerType[]
}
export function ServerHome({ mcpServers }: ServerHomeProps) {
    const [servers, setServers] = useState<ServerType[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedServer, setSelectedServer] = useState<ServerType | null>(null)

    // Handle messages from the extension
    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data

            if (message.type === 'clientAction') {
                if (message.mcpServerError) {
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
                server.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                server.tools?.some(tool => tool.name.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    }, [searchQuery, servers, mcpServers])

    if (mcpServers?.length === 0) {
        return (
            <div className="tw-w-full tw-p-4">
                <div className="tw-w-full tw-col-span-full tw-text-center tw-py-12 tw-border tw-rounded-lg tw-border-dashed">
                    <Server className="tw-h-12 tw-w-12 tw-mx-auto tw-mb-4 tw-text-muted-foreground" />
                    <h3 className="tw-text-md tw-font-medium">Connecting...</h3>
                </div>
            </div>
        )
    }

    if (!servers) {
        return (
            <div className="tw-w-full tw-p-4">
                <div className="tw-w-full tw-col-span-full tw-text-center tw-py-12 tw-border tw-rounded-lg tw-border-dashed">
                    <Server className="tw-h-12 tw-w-12 tw-mx-auto tw-mb-4 tw-text-muted-foreground" />
                    <h3 className="tw-text-md tw-font-medium">No servers found</h3>
                    <p className="tw-text-muted-foreground tw-mt-1">Add a new server to get started</p>
                </div>
                <AddServerView onAddServer={addServers} className="tw-my-4 tw-w-full tw-py-1" />
            </div>
        )
    }

    return (
        <Command
            loop={true}
            tabIndex={0}
            shouldFilter={false}
            defaultValue="empty"
            className="tw-flex tw-flex-col tw-h-full tw-py-4 tw-bg-transparent tw-px-2 tw-mb-4 tw-overscroll-auto"
            disablePointerSelection={true}
        >
            <CommandList>
                <CommandInput
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    placeholder="Search..."
                    autoFocus={true}
                    className="tw-m-[0.5rem] !tw-p-[0.5rem] tw-rounded tw-bg-input-background tw-text-input-foreground focus:tw-shadow-[0_0_0_0.125rem_var(--vscode-focusBorder)]"
                />
            </CommandList>
            <CommandList className="tw-flex-1 tw-overflow-y-auto tw-m-2 tw-gap-2">
                {filteredServers.map(server => {
                    return (
                        <CommandItem
                            key={server.id}
                            className="tw-text-left tw-truncate tw-w-full tw-rounded-md tw-text-sm tw-overflow-hidden tw-text-sidebar-foreground tw-align-baseline hover:tw-bg-transparent"
                            onSelect={() => setSelectedServer(server)}
                        >
                            <div className="tw-truncate tw-w-full tw-flex tw-flex-col tw-gap-2">
                                <div className="tw-flex tw-items-center tw-gap-2">
                                    <PlugZapIcon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                                    <strong>{server.name}</strong>
                                </div>
                                <div className="tw-flex tw-align-top tw-justify-between tw-my-1 tw-flex-wrap">
                                    {server.error && (
                                        <div className="tw-mt-2 tw-mb-1 tw-w-full">
                                            <p
                                                className="tw-text-xs tw-text-pink-300 tw-mt-1 tw-truncate"
                                                title={server.error}
                                            >
                                                {server.error}
                                            </p>
                                        </div>
                                    )}
                                    {server.tools && server.tools?.length > 0 && (
                                        <div className="tw-mt-2">
                                            <div className="tw-flex tw-flex-wrap tw-gap-4">
                                                {server.tools.map(t => (
                                                    <Badge
                                                        variant="success"
                                                        key={t.name}
                                                        className="tw-truncate tw-max-w-[250px] tw-text-foreground"
                                                        title={t.description}
                                                    >
                                                        {t.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {server.name === selectedServer?.name && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="tw-h-8 tw-p-2 tw-z-10"
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
                                    <XIcon size={16} className="tw-mr-1" />
                                </Button>
                            )}
                        </CommandItem>
                    )
                })}
                <AddServerView onAddServer={addServers} className="tw-my-4 tw-w-full tw-py-1" />
            </CommandList>
        </Command>
    )
}
