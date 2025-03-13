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
            return {
                text: `Successfully retrieved content from ${validInput.name}.`,
                contextItems: context ? [context] : undefined,
            }
        } catch (error) {
            return {
                text: `Failed to read file ${validInput.name}: ${error}`,
            }
        }
    },
}
