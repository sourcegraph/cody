import type { McpTool } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import type { Meta, StoryObj } from '@storybook/react'
import { DatabaseBackup, PencilRulerIcon } from 'lucide-react'
import { VSCodeWebview } from '../../storybook/VSCodeStoryDecorator'
import { ServerHome } from './ServerHome'
import type { ServerType } from './types'

// Sample mock data for mcpServers
const mockServers: ServerType[] = [
    {
        id: 'server-1',
        name: 'Local MCP Server',
        type: 'stdio',
        status: 'online',
        icon: DatabaseBackup,
        command: 'mcp-server',
        args: ['--port', '8080'],
        env: [
            { name: 'API_KEY', value: 'mock-api-key' },
            { name: 'DEBUG', value: 'true' },
        ],
        tools: [
            {
                name: 'read_file',
                description: 'Reads file contents',
                input_schema: {},
                disabled: false,
            } as McpTool,
            {
                name: 'write_file',
                description: 'Writes content to a file',
                input_schema: {},
                disabled: true,
            } as McpTool,
            {
                name: 'list_files',
                description: 'Lists files in a directory',
                input_schema: {},
                disabled: false,
            } as McpTool,
        ],
    },
    {
        id: 'server-2',
        name: 'Remote MCP Server',
        type: 'sse',
        status: 'offline',
        icon: PencilRulerIcon,
        url: 'https://example.com/mcp',
        tools: [
            {
                name: 'search',
                description: 'Search for text in files',
                input_schema: {},
                disabled: false,
            } as McpTool,
            {
                name: 'terminal',
                description: 'Run terminal commands',
                input_schema: {},
                disabled: false,
            } as McpTool,
        ],
    },
    {
        id: 'server-3',
        name: 'Error Server',
        type: 'stdio',
        status: 'offline',
        icon: DatabaseBackup,
        command: 'broken-server',
        error: 'Connection failed: Could not start server process',
        tools: [],
    },
]

const meta: Meta<typeof ServerHome> = {
    title: 'MCP/ServerHome',
    component: ServerHome,
    decorators: [VSCodeWebview],
    args: {
        mcpServers: mockServers,
    },
}

export default meta

type Story = StoryObj<typeof ServerHome>

export const Default: Story = {}

export const EmptyState: Story = {
    args: {
        mcpServers: [],
    },
}

export const WithSearchFilter: Story = {
    args: {
        mcpServers: mockServers,
    },
    play: async ({ canvasElement }) => {
        // In a real implementation, you would use testing-library to simulate user typing in the search box
        // This is just a placeholder for the story
        const searchInput = canvasElement.querySelector(
            'input[placeholder="Search..."]'
        ) as HTMLInputElement
        if (searchInput) {
            searchInput.value = 'search'
            searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        }
    },
}

export const WithError: Story = {
    args: {
        mcpServers: [mockServers[2]],
    },
}
