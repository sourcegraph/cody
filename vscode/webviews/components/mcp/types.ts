import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import type { LucideIcon } from 'lucide-react'

export interface ServerMetrics {
    tools: number
    uptime?: string
}

interface EnvironmentVariable {
    name: string
    value: string
}

export interface ServerType {
    id: string
    name: string
    type: string
    status: 'online' | 'offline' | 'disabled' | 'connecting'
    icon?: LucideIcon
    url?: string
    command?: string
    args?: string[]
    env?: EnvironmentVariable[]
    metrics?: ServerMetrics
    tools?: McpTool[]
    error?: string
}

export interface ApiKey {
    id: string
    name: string
    key: string
    created: string
    lastUsed: string
}
