import type { Tool } from '@anthropic-ai/sdk/resources'
import type { Span } from '@opentelemetry/api'
import type { ContextItem } from '@sourcegraph/cody-shared'
import type { ContextRetriever } from '../ContextRetriever'
import { diagnosticTool } from './diagnostic'
import { editTool } from './edit'
import { getFileTool } from './file'
import { getCodebaseSearchTool } from './search'
import { shellTool } from './shell'

export type AgentID = string

export interface AgentTool {
    spec: Tool
    // validate: (input: any) => string | undefined
    invoke: (input: any) => Promise<AgentToolResult>
}

export interface AgentToolResult {
    text: string
    contextItems?: ContextItem[]
}

export class AgentToolGroup {
    private static readonly DEFAULT_TOOLS: AgentTool[] = [
        getFileTool,
        shellTool,
        diagnosticTool,
        editTool,
    ]

    private static readonly instance: Map<AgentID, AgentToolGroup> = new Map()

    public readonly agentId: AgentID
    public readonly tools: AgentTool[]

    constructor(agentId: AgentID, tools: AgentTool[]) {
        this.agentId = agentId
        this.tools = tools
    }

    public getToolByName(name: string): AgentTool | undefined {
        return this.tools.find(tool => tool.spec.name === name)
    }

    public static getInstance(agentId: AgentID): AgentToolGroup {
        let instance = AgentToolGroup.instance.get(agentId)
        if (!instance) {
            // Initialize with default tools if no instance exists
            instance = new AgentToolGroup(agentId, AgentToolGroup.DEFAULT_TOOLS)
            AgentToolGroup.instance.set(agentId, instance)
        }
        return instance
    }

    public static async createWithContextTools(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        span: Span,
        agentId: AgentID
    ): Promise<AgentToolGroup> {
        const baseInstance = AgentToolGroup.getInstance(agentId)
        const searchTool = await getCodebaseSearchTool(contextRetriever, span)

        // Create a new instance with all the tools
        return new AgentToolGroup(agentId, [...baseInstance.tools, searchTool])
    }

    public static async getToolsByAgentId(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        span: Span,
        agentId: AgentID = 'agentic'
    ): Promise<AgentTool[]> {
        const toolGroup = await AgentToolGroup.createWithContextTools(contextRetriever, span, agentId)
        return toolGroup.tools
    }
}
