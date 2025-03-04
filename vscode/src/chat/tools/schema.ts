import type { ToolUseBlockParam } from '@anthropic-ai/sdk/resources'
import { z } from 'zod'

// Zod schema for tool input// Zod schema for edit tool input
export const EditToolSchema = z.object({
    command: z
        .enum(['view', 'create', 'str_replace', 'insert', 'undo_edit'])
        .describe('The command to execute'),
    path: z.string().describe('The relative path of the file'),
    file_text: z.string().optional().describe('The full contents of the new file for create command'),
    view_range: z
        .array(z.number().int())
        .length(2)
        .optional()
        .describe('Range of lines to view [startLine, endLine]'),
    old_str: z.string().optional().describe('String to replace'),
    new_str: z.string().optional().describe('String to replace with'),
    insert_line: z.number().int().optional().describe('Line number to insert at'),
})

export const GetFileSchema = z.object({
    name: z.string().describe('The name of the file to retrieve'),
})

export const RunTerminalCommandSchema = z.object({
    command: z
        .string()
        .describe('The command to run in the root of the users project. Must be shell escaped.'),
})

export const GetDiagnosticSchema = z.object({
    name: z.string().describe('The name of the file for which to retrieve diagnostics from.'),
})

export const CodeSearchSchema = z.object({
    query: z.string().describe('Keyword query to search for.'),
})

// Define types based on schemas for type safety
export type GetFileInput = z.infer<typeof GetFileSchema>
export type RunTerminalCommandInput = z.infer<typeof RunTerminalCommandSchema>
export type GetDiagnosticInput = z.infer<typeof GetDiagnosticSchema>
export type CodeSearchInput = z.infer<typeof CodeSearchSchema>
export type EditToolInput = z.infer<typeof EditToolSchema>

// Utility function to validate tool input
export function validateWithZod<T>(schema: z.ZodType<T>, input: unknown, toolName: string): T {
    const parsed = schema.safeParse(sanitizeToolInput(input))
    if (!parsed.success) {
        const errorMsg = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        throw new Error(`${toolName} validation failed: ${errorMsg}`)
    }
    return parsed.data
}

function sanitizeToolInput(input: unknown): string | unknown {
    // Try to parse the input if it's a string that looks like JSON
    if (typeof input === 'string' && (input.startsWith('{') || input.startsWith('['))) {
        try {
            return JSON.parse(input)
        } catch (e) {
            // If parsing fails, continue with the original input
            // This allows strings that just happen to start with { or [ but aren't JSON
        }
    }
    return input
}

export function getToolBlock(contentBlock: ToolUseBlockParam): string {
    const formatters: Record<string, (input: any) => { title: string; text: string }> = {
        text_editor: (input: EditToolInput) => ({
            title: `${
                input.command === 'view'
                    ? 'Viewing'
                    : input.command === 'create'
                      ? 'Creating'
                      : 'Editing'
            } File`,
            text: `Editing File: ${input.path}\n${
                input.old_str ? `Old: "${input.old_str}"\nNew: "${input.new_str}"` : ''
            }`,
        }),
        get_diagnostic: (input: GetDiagnosticInput) => ({
            title: 'Scanning Diagnostics',
            text: `Getting Diagnostics for: ${input.name}`,
        }),
        code_search: (input: CodeSearchInput) => ({
            title: 'Searching Codebase',
            text: `Query: ${input.query}`,
        }),
        get_file: (input: GetFileInput) => ({
            title: 'Retrieving File',
            text: `Retrieving File: ${input.name}`,
        }),
        run_terminal_command: (input: RunTerminalCommandInput) => ({
            title: 'Executing Terminal Command',
            text: `Executing Command: ${input.command}`,
        }),
    }

    // Use the formatter if available, otherwise fallback to default
    const { title, text } = formatters[contentBlock.name]
        ? formatters[contentBlock.name](contentBlock.input)
        : {
              title: 'Unknown Tool',
              text: JSON.stringify(contentBlock.input, null, 2),
          }

    // Return formatted tool block
    return `\n\`\`\`yaml:tool tool=${title} id=${contentBlock.id}\n${text}\n\`\`\`\n`
}
