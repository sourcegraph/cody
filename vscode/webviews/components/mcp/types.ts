import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import { Cpu, Database, Globe, type LucideIcon, Shield } from 'lucide-react'

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
    status: 'online' | 'offline'
    icon?: LucideIcon
    url?: string
    command?: string
    args?: string[]
    env?: EnvironmentVariable[]
    metrics?: ServerMetrics
    tools?: McpTool[]
}

export interface ApiKey {
    id: string
    name: string
    key: string
    created: string
    lastUsed: string
}

// Sample data
export const initialServers: ServerType[] = [
    {
        id: 'server-1',
        name: 'Production API',
        type: 'API Server',
        status: 'online' as const,
        icon: Globe,
        url: 'https://api.example.com',
        command: 'npm run start:prod',
        args: ['--port=3000', '--env=production'],
        env: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'API_KEY', value: '••••••••••••••••' },
            {
                name: 'DATABASE_URL',
                value: 'postgres://user:pass@db.example.com:5432/prod',
            },
        ],
        metrics: {
            tools: 15,
            uptime: '14d 6h 32m',
        },
    },
    {
        id: 'server-2',
        name: 'Database Cluster',
        type: 'Database',
        status: 'online' as const,
        icon: Database,
        url: 'postgres://db.example.com:5432',
        command: 'docker-compose up -d',
        args: [''],
        env: [
            { name: 'POSTGRES_USER', value: 'admin' },
            { name: 'POSTGRES_PASSWORD', value: '••••••••••••' },
            { name: 'POSTGRES_DB', value: 'main' },
        ],
        metrics: {
            tools: 15,
            uptime: '30d 12h 45m',
        },
    },
    {
        id: 'server-3',
        name: 'Worker Node 1',
        type: 'Worker',
        status: 'offline' as const,
        icon: Cpu,
        url: 'http://worker1.internal:8080',
        command: 'npm run worker',
        args: ['--queue=high'],
        env: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'REDIS_URL', value: 'redis://cache.example.com:6379' },
        ],
        metrics: {
            tools: 15,
            uptime: '0d 0h 0m',
        },
    },
    {
        id: 'server-4',
        name: 'Worker Node 2',
        type: 'Worker',
        status: 'online' as const,
        icon: Cpu,
        url: 'http://worker2.internal:8080',
        command: 'npm run worker',
        args: ['--queue=low'],
        env: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'REDIS_URL', value: 'redis://cache.example.com:6379' },
        ],
        metrics: {
            tools: 15,
            uptime: '7d 14h 22m',
        },
    },
    {
        id: 'server-5',
        name: 'Auth Service',
        type: 'Service',
        status: 'online' as const,
        icon: Shield,
        url: 'https://auth.example.com',
        command: 'npm run auth',
        args: [''],
        env: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'JWT_SECRET', value: '••••••••••••••••••••' },
            { name: 'OAUTH_CLIENT_ID', value: '••••••••••••' },
            { name: 'OAUTH_CLIENT_SECRET', value: '••••••••••••••••' },
        ],
        metrics: {
            tools: 15,
            uptime: '21d 8h 14m',
        },
    },
]

export const initialApiKeys = [
    {
        id: 'key-1',
        name: 'Production API Key',
        key: '••••••••••••••••••••••••••••••••',
        created: '2023-05-15',
        lastUsed: '2023-10-28',
    },
    {
        id: 'key-2',
        name: 'Development API Key',
        key: '••••••••••••••••••••••••••••••••',
        created: '2023-06-22',
        lastUsed: '2023-10-27',
    },
    {
        id: 'key-3',
        name: 'Testing API Key',
        key: '••••••••••••••••••••••••••••••••',
        created: '2023-08-10',
        lastUsed: '2023-10-20',
    },
]
