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
