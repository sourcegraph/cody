import { zodToAnthropicSchema } from '../chat-view/handlers/AgenticHandler'
import { type GetFileInput, GetFileSchema, validateWithZod } from './schema'
import { getWorkspaceFile } from './utils'

export const getFileTool = {
    spec: {
        name: 'get_file',
        description:
            'To retrieve full content of a codebase file. DO NOT retrieve files that may contain secrets',
        input_schema: zodToAnthropicSchema(GetFileSchema),
    },
    invoke: async (input: GetFileInput) => {
        const validInput = validateWithZod(GetFileSchema, input, 'get_file')
        try {
            const fileInfo = await getWorkspaceFile(validInput.name)
            return fileInfo?.doc?.getText() ?? ''
        } catch (error) {
            throw new Error(`Failed to read file ${validInput.name}: ${error}`)
        }
    },
}
