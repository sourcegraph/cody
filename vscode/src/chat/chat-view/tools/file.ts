import { ContextItemSource, UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { URI } from 'vscode-uri'
import type { AgentTool } from '.'
import { getContextFromRelativePath } from '../../../commands/context/file-path'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { type GetFileInput, GetFileSchema } from './schema'

export const getFileTool: AgentTool = {
    spec: {
        name: 'get_file',
        description:
            'To retrieve full content of a codebase file. DO NOT retrieve files that may contain secrets',
        input_schema: zodToolSchema(GetFileSchema),
    },
    invoke: async (input: GetFileInput) => {
        const validInput = validateWithZod(GetFileSchema, input, 'get_file')
        try {
            const context = await getContextFromRelativePath(validInput.name)
            if (context === undefined || !context?.content) {
                throw new Error(`File ${validInput.name} not found or empty`)
            }
            // For successful file retrieval
            return createFileToolState(
                validInput.name,
                context.content + '\n<<EOF>>', // Keep the EOF marker which can be useful
                UIToolStatus.Done,
                context.uri // Use the actual file URI if available
            )
        } catch (error) {
            // For errors during file retrieval
            return createFileToolState(
                validInput.name,
                `${error}`,
                UIToolStatus.Error,
                URI.parse(validInput.name)
            )
        }
    },
}

/**
 * Creates a ContextItemToolState for file retrieval operations
 */
function createFileToolState(
    filePath: string,
    content: string,
    status: UIToolStatus,
    uri: URI
): ContextItemToolState {
    const toolId = `get_file-${filePath.replace(/[^\w]/g, '_')}-${Date.now()}`

    return {
        type: 'tool-state',
        toolId,
        toolName: 'get_file',
        status,
        outputType: 'file-view',
        // ContextItemCommon properties
        uri,
        content,
        title: filePath,
        description: `File: ${filePath}`,
        source: ContextItemSource.Agentic,
        icon: 'file-code',
        metadata: [
            `File: ${filePath}`,
            `Status: ${status}`,
            `Content Length: ${content.length} characters`,
        ],
    }
}
