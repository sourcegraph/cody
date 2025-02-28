import type { Tool } from '@anthropic-ai/sdk/resources'
import type { Span } from '@opentelemetry/api'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { diagnosticTool } from './diagnostic'
import { editTool } from './edit'
import { getFileTool } from './file'
import { getCodebaseSearchTool } from './search'
import { shellTool } from './shell'

export type ToolVersion = 'claude' | 'gemini'

export interface AgentTool {
    spec: Tool
    invoke: (input: any) => Promise<string>
}

export class AgentToolGroup {
    private static readonly DEFAULT_TOOLS: AgentTool[] = [
        getFileTool,
        shellTool,
        diagnosticTool,
        editTool,
    ]

    // TODO: group by agent name
    private static readonly instance: Map<ToolVersion, AgentToolGroup> = new Map([
        ['claude', new AgentToolGroup('claude', this.DEFAULT_TOOLS)],
        ['gemini', new AgentToolGroup('gemini', this.DEFAULT_TOOLS)],
    ])

    public readonly version: ToolVersion
    public readonly tools: AgentTool[]

    constructor(version: ToolVersion, tools: AgentTool[]) {
        this.version = version
        this.tools = tools
    }

    public getToolByName(name: string): AgentTool | undefined {
        return this.tools.find(tool => tool.spec.name === name)
    }

    public static getInstance(version: ToolVersion): AgentToolGroup {
        const instance = AgentToolGroup.instance.get(version)
        if (!instance) {
            throw new Error(`No tool group found for version ${version}`)
        }
        return instance
    }

    public static async createWithContextTools(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        span: Span,
        version: ToolVersion = 'claude'
    ): Promise<AgentToolGroup> {
        const baseInstance = AgentToolGroup.getInstance(version)
        const searchTool = await getCodebaseSearchTool(contextRetriever, span)

        // Create a new instance with all the tools
        return new AgentToolGroup(version, [...baseInstance.tools, searchTool])
    }

    public static async getToolsByVersion(
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        span: Span,
        version: ToolVersion = 'claude'
    ): Promise<AgentTool[]> {
        const toolGroup = await AgentToolGroup.createWithContextTools(contextRetriever, span, version)
        return toolGroup.tools
    }
}
