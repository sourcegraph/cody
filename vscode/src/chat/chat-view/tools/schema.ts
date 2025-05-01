import { z } from 'zod'

// Zod schema for edit tool input
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
})

// Define types based on schemas for type safety
export type GetFileInput = z.infer<typeof GetFileSchema>
export type RunTerminalCommandInput = z.infer<typeof RunTerminalCommandSchema>
export type GetDiagnosticInput = z.infer<typeof GetDiagnosticSchema>
export type CodeSearchInput = z.infer<typeof CodeSearchSchema>
export type EditToolInput = z.infer<typeof EditToolSchema>

// Zod schema for tool input
export const DEDAULT_TOOLS_SCHEMA = {
    get_diagnostic: {
        name: 'get_diagnostic',
        description:
            'Get diagnostics (including errors) from the editor for the file you have used text_editor on. This tool should be used at the end of your response on the files you have edited.',
        schema: RunTerminalCommandSchema,
    },
    text_editor: {
        name: 'text_editor',
        description:
            'An filesystem editor tool that allows access to view, create, and edit files with source control history.',
        schema: EditToolSchema,
    },
    code_search: {
        name: 'code_search',
        description: 'Perform a keyword query search in the codebase.',
        schema: CodeSearchSchema,
    },
    get_file: {
        name: 'get_file',
        description:
            'To retrieve full content of a codebase file. DO NOT retrieve files that may contain secrets',
        schema: GetFileSchema,
    },
    run_terminal_command: {
        name: 'run_terminal_command',
        description:
            'Run an arbitrary terminal command at the root of the users project. E.g. `ls -la` for listing files, or `find` for searching latest version of the codebase files locally.',
        schema: RunTerminalCommandSchema,
    },
}
