import { ChevronLeft, ChevronRight, Cloud, Search, Server } from 'lucide-react'
import * as React from 'react'
import { Badge } from '../../shadcn/ui/badge'
import { Button } from '../../shadcn/ui/button'
import { Input } from '../../shadcn/ui/input'
import { ScrollArea } from '../../shadcn/ui/scroll-area'
import { cn } from '../../shadcn/utils'
import { ServerListItem } from '../ServerListItem'
import { type ServerType, initialServers } from '../types'
import { AddServerView } from './AddServerView'
import { ServersView } from './ServersView'

export function ServerDashboard() {
    const [isSidebarView, setIsSidebarView] = React.useState(false)
    const [activeTab, setActiveTab] = React.useState<'servers' | 'api-keys'>('servers')
    const [servers, setServers] = React.useState<ServerType[]>(initialServers)
    const [selectedServer, setSelectedServer] = React.useState<ServerType | null>(null)
    const [searchQuery, setSearchQuery] = React.useState('')

    // Filter servers based on search query
    const filteredServers = servers.filter(
        server =>
            server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            server.type.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Add new server
    const addServer = (newServer: ServerType) => {
        const server: ServerType = {
            ...newServer,
            id: `server-${servers.length + 1}`,
        }
        setServers([...servers, server])
    }

    return (
        <div
            className={cn(
                'tw-flex tw-h-full tw-bg-background tw-transition-all tw-duration-300',
                isSidebarView ? 'tw-flex-row' : 'tw-flex-col'
            )}
        >
            {/* Sidebar/Header */}
            <div
                className={cn(
                    'tw-bg-sidebar tw-text-sidebar-foreground tw-transition-all tw-duration-300',
                    isSidebarView
                        ? 'tw-w-80 tw-min-w-80 tw-h-full tw-border-r tw-border-border'
                        : 'tw-w-full tw-h-auto tw-border-b tw-border-border'
                )}
            >
                <div className="tw-flex tw-items-center tw-justify-between tw-p-4">
                    <div className="tw-flex tw-items-center tw-gap-2">
                        <Cloud className="tw-h-5 tw-w-5 tw-text-primary" />
                        <h1 className="tw-text-lg tw-font-semibold">Server Manager</h1>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setIsSidebarView(!isSidebarView)}>
                        {isSidebarView ? (
                            <ChevronLeft className="tw-h-5 tw-w-5" />
                        ) : (
                            <ChevronRight className="tw-h-5 tw-w-5" />
                        )}
                    </Button>
                </div>

                {isSidebarView && (
                    <>
                        <div className="tw-px-4 tw-py-2">
                            <div className="tw-relative">
                                <Search className="tw-absolute tw-left-2 tw-top-2.5 tw-h-4 tw-w-4 tw-text-muted-foreground" />
                                <Input
                                    placeholder="Search..."
                                    className="tw-pl-8 tw-h-9 tw-bg-muted/50"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="tw-w-full">
                            <div className="tw-px-4 tw-pt-2">
                                <div className="tw-w-full">
                                    <Button
                                        className={`tw-flex-1 ${
                                            activeTab === 'servers' ? 'tw-font-bold' : ''
                                        }`}
                                        onClick={() => setActiveTab('servers')}
                                    >
                                        Servers
                                    </Button>
                                    <Button
                                        className={`tw-flex-1 ${
                                            activeTab === 'api-keys' ? 'tw-font-bold' : ''
                                        }`}
                                        onClick={() => setActiveTab('api-keys')}
                                    >
                                        API Keys
                                    </Button>
                                </div>
                            </div>

                            {activeTab === 'servers' && (
                                <div className="tw-mt-0">
                                    <div className="tw-flex tw-justify-between tw-items-center tw-px-4 tw-py-2">
                                        <div className="tw-flex tw-items-center tw-gap-2">
                                            <span className="tw-text-sm tw-font-medium">Servers</span>
                                            <Badge variant="outline" className="tw-text-xs">
                                                {servers.filter(s => s.status === 'online').length}/
                                                {servers.length}
                                            </Badge>
                                        </div>
                                        <AddServerView onAddServer={addServer} />
                                    </div>

                                    <ScrollArea className="tw-h-[calc(100vh-180px)]">
                                        <div className="tw-px-2 tw-py-1">
                                            {filteredServers.map(server => (
                                                <ServerListItem
                                                    key={server.id}
                                                    server={server}
                                                    isActive={selectedServer?.id === server.id}
                                                    onClick={() => setSelectedServer(server)}
                                                />
                                            ))}

                                            {filteredServers.length === 0 && (
                                                <div className="tw-text-center tw-py-8 tw-text-muted-foreground">
                                                    <Server className="tw-h-8 tw-w-8 tw-mx-auto tw-mb-2 tw-opacity-50" />
                                                    <p>No servers found</p>
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {!isSidebarView && (
                    <div className="tw-flex tw-items-center tw-px-4 tw-pb-4">
                        <div className="tw-w-full">
                            <div className="tw-flex tw-items-center tw-gap-4">
                                <div>
                                    <Button
                                        className={activeTab === 'servers' ? 'tw-font-bold' : ''}
                                        onClick={() => setActiveTab('servers')}
                                    >
                                        Servers
                                    </Button>
                                    <Button
                                        className={activeTab === 'api-keys' ? 'tw-font-bold' : ''}
                                        onClick={() => setActiveTab('api-keys')}
                                    >
                                        API Keys
                                    </Button>
                                </div>

                                <div className="tw-relative tw-w-64">
                                    <Search className="tw-absolute tw-left-2 tw-top-2.5 tw-h-4 tw-w-4 tw-text-muted-foreground" />
                                    <Input
                                        placeholder="Search..."
                                        className="tw-pl-8 tw-h-9 tw-bg-muted/50"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {activeTab === 'servers' && <AddServerView onAddServer={addServer} />}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className={cn('tw-flex-1 tw-overflow-auto', isSidebarView ? '' : '')}>
                {activeTab === 'servers' && (
                    <ServersView
                        servers={filteredServers}
                        selectedServer={selectedServer}
                        onSelectServer={setSelectedServer}
                        addServers={addServer}
                    />
                )}
            </div>
        </div>
    )
}
