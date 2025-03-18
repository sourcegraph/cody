import type { AgentTool } from '.'
import { getContextFromRelativePath } from '../../../commands/context/file-path'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import { type GetFileInput, GetFileSchema } from './schema'

const CONTEXT_TEMPLATE = '```{{FILENAME}}\n{{CONTENT}}\n```'

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

            return {
                text: CONTEXT_TEMPLATE.replace('{{FILENAME}}', validInput.name).replace(
                    '{{CONTENT}}',
                    context.content + '\nEOF'
                ),
                contextItems: [context],
            }
        } catch (error) {
            return {
                text: `get_file for ${validInput.name} failed: ${error}`,
            }
        }
    },
}
