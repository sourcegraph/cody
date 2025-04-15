import type { Tool } from '@anthropic-ai/sdk/resources/beta/tools/messages.mjs'

export interface McpTool extends Tool {
    autoApprove?: boolean
}

// Define types for MCP entities
export interface McpServer {
    name: string
    config: string
    status: 'connecting' | 'connected' | 'disconnected'
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
