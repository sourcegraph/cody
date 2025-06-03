import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages.mjs'

export interface McpTool extends Tool {
    autoApprove?: boolean
    disabled?: boolean
}

export type McpConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'removed'

// Define types for MCP entities
export interface McpServer {
    name: string
    config: string
    status: McpConnectionStatus
    disabled?: boolean
    error?: string
    tools?: McpTool[]
    resources?: McpResource[]
    resourceTemplates?: McpResourceTemplate[]
    approvalRequired?: boolean
}

export interface McpResource {
    uri: string
    mimeType?: string
    title?: string
    description?: string
}

export interface McpResourceTemplate extends McpResource {
    type: 'template'
}

export interface McpResourceResponse {
    content: any
}

export interface McpToolCallResponse {
    result: any
}
