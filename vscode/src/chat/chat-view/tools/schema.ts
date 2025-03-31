import { z } from 'zod'

// Zod schema for tool input// Zod schema for edit tool input
export const EditToolSchema = z.object({
    command: z.enum(['create', 'str_replace', 'insert', 'undo_edit']).describe('The command to execute'),
    path: z.string().describe('The relative path of the file'),
    file_text: z.string().optional().describe('The full contents of the new file for create command'),
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
    danger: z
        .boolean()
        .default(false)
        .optional()
        .describe('Whether the command is dangerous. If true, user will be asked to confirm.'),
})

export const GetDiagnosticSchema = z.object({
    name: z
        .string()
        .describe(
            'The name of the file for which to retrieve diagnostics from. Put "*" to get all diagnostics from current codebase.'
        ),
    type: z
        .enum(['error', 'warning', 'all'])
        .optional()
        .describe('The type of diagnostics to retrieve. Default to error type when not specificied.'),
})

export const CodeSearchSchema = z.object({
    query: z.string().describe('Keyword query to search for.'),
    include: z
        .string()
        .optional()
        .describe('Glob pattern to include files in the search. Default is all files.'),
    exclude: z
        .string()
        .optional()
        .describe('Glob pattern to exclude files from the search. Default is no exclusions.'),
    dir: z
        .string()
        .optional()
        .describe('Directory to search in. Default to use the current codebase root.'),
})

export const SearchAgentSchema = z.object({
    query: z.string().describe('Specific instruction for the agent to follow when searching for code.'),
})

// Define types based on schemas for type safety
export type GetFileInput = z.infer<typeof GetFileSchema>
export type RunTerminalCommandInput = z.infer<typeof RunTerminalCommandSchema>
export type GetDiagnosticInput = z.infer<typeof GetDiagnosticSchema>
export type CodeSearchInput = z.infer<typeof CodeSearchSchema>
export type EditToolInput = z.infer<typeof EditToolSchema>
