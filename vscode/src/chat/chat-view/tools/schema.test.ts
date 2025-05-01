import { describe, expect, it } from 'vitest'
import { validateWithZod } from '../utils/input'
import { zodToolSchema } from '../utils/parse'
import {
    convertToolsSchemasToJson,
    getDefaultToolFunctions,
    zodSchemaToJson,
} from '../utils/schema-utils'
import {
    CodeSearchSchema,
    DEDAULT_TOOLS_SCHEMA,
    EditToolSchema,
    GetDiagnosticSchema,
    GetFileSchema,
    RunTerminalCommandSchema,
} from './schema'

describe('Schema Validation', () => {
    describe('EditToolSchema', () => {
        it('should validate valid create command input', () => {
            const input = {
                command: 'create',
                path: 'test/file.ts',
                file_text: 'console.log("Hello World")',
            }

            const result = validateWithZod(EditToolSchema, input, 'text_editor')

            expect(result).toEqual(input)
        })

        it('should validate valid str_replace command input', () => {
            const input = {
                command: 'str_replace',
                path: 'test/file.ts',
                old_str: 'Hello',
                new_str: 'World',
            }

            const result = validateWithZod(EditToolSchema, input, 'text_editor')

            expect(result).toEqual(input)
        })

        it('should validate valid insert command input', () => {
            const input = {
                command: 'insert',
                path: 'test/file.ts',
                insert_line: 10,
                new_str: 'console.log("New line")',
            }

            const result = validateWithZod(EditToolSchema, input, 'text_editor')

            expect(result).toEqual(input)
        })

        it('should validate valid undo_edit command input', () => {
            const input = {
                command: 'undo_edit',
                path: 'test/file.ts',
            }

            const result = validateWithZod(EditToolSchema, input, 'text_editor')

            expect(result).toEqual(input)
        })

        it('should throw error for invalid command', () => {
            const input = {
                command: 'invalid_command',
                path: 'test/file.ts',
            }

            expect(() => validateWithZod(EditToolSchema, input, 'text_editor')).toThrow()
        })

        it('should throw error when required path is missing', () => {
            const input = {
                command: 'create',
            }

            expect(() => validateWithZod(EditToolSchema, input, 'text_editor')).toThrow()
        })
    })

    describe('GetFileSchema', () => {
        it('should validate valid input', () => {
            const input = {
                name: 'test/file.ts',
            }

            const result = validateWithZod(GetFileSchema, input, 'get_file')

            expect(result).toEqual(input)
        })

        it('should throw error when name is missing', () => {
            const input = {}

            expect(() => validateWithZod(GetFileSchema, input, 'get_file')).toThrow()
        })
    })

    describe('RunTerminalCommandSchema', () => {
        it('should validate valid input without danger flag', () => {
            const input = {
                command: 'ls -la',
            }

            const result = validateWithZod(RunTerminalCommandSchema, input, 'run_terminal_command')

            expect(result).toEqual({ command: 'ls -la', danger: false })
        })

        it('should validate valid input with danger flag', () => {
            const input = {
                command: 'rm -rf',
                danger: true,
            }

            const result = validateWithZod(RunTerminalCommandSchema, input, 'run_terminal_command')

            expect(result).toEqual(input)
        })

        it('should throw error when command is missing', () => {
            const input = {
                danger: false,
            }

            expect(() =>
                validateWithZod(RunTerminalCommandSchema, input, 'run_terminal_command')
            ).toThrow()
        })
    })

    describe('GetDiagnosticSchema', () => {
        it('should validate valid input with only name', () => {
            const input = {
                name: 'test/file.ts',
            }

            const result = validateWithZod(GetDiagnosticSchema, input, 'get_diagnostic')

            expect(result).toEqual(input)
        })

        it('should validate valid input with name and type', () => {
            const input = {
                name: 'test/file.ts',
                type: 'error',
            }

            const result = validateWithZod(GetDiagnosticSchema, input, 'get_diagnostic')

            expect(result).toEqual(input)
        })

        it('should validate input with wildcard name', () => {
            const input = {
                name: '*',
                type: 'all',
            }

            const result = validateWithZod(GetDiagnosticSchema, input, 'get_diagnostic')

            expect(result).toEqual(input)
        })

        it('should throw error when name is missing', () => {
            const input = {
                type: 'error',
            }

            expect(() => validateWithZod(GetDiagnosticSchema, input, 'get_diagnostic')).toThrow()
        })

        it('should throw error for invalid type', () => {
            const input = {
                name: 'test/file.ts',
                type: 'invalid_type',
            }

            expect(() => validateWithZod(GetDiagnosticSchema, input, 'get_diagnostic')).toThrow()
        })
    })

    describe('CodeSearchSchema', () => {
        it('should validate valid input', () => {
            const input = {
                query: 'function validateWithZod',
            }

            const result = validateWithZod(CodeSearchSchema, input, 'code_search')

            expect(result).toEqual(input)
        })

        it('should throw error when query is missing', () => {
            const input = {}

            expect(() => validateWithZod(CodeSearchSchema, input, 'code_search')).toThrow()
        })
    })

    describe('DEDAULT_TOOLS_SCHEMA', () => {
        it('should have the correct tool schemas', () => {
            expect(Object.keys(DEDAULT_TOOLS_SCHEMA)).toEqual([
                'get_diagnostic',
                'text_editor',
                'code_search',
                'get_file',
                'run_terminal_command',
            ])
        })

        it('should have the correct schema for get_diagnostic', () => {
            const schema = DEDAULT_TOOLS_SCHEMA.get_diagnostic

            expect(schema.name).toBe('get_diagnostic')
            expect(schema.description).toContain('Get diagnostics')
            expect(schema.schema).toEqual(zodToolSchema(GetDiagnosticSchema))
        })

        it('should have the correct schema for text_editor', () => {
            const schema = DEDAULT_TOOLS_SCHEMA.text_editor

            expect(schema.name).toBe('text_editor')
            expect(schema.description).toContain('filesystem editor tool')
            expect(schema.schema).toEqual(zodToolSchema(EditToolSchema))
        })

        it('should have the correct schema for code_search', () => {
            const schema = DEDAULT_TOOLS_SCHEMA.code_search

            expect(schema.name).toBe('code_search')
            expect(schema.description).toContain('keyword query search')
            expect(schema.schema).toEqual(zodToolSchema(CodeSearchSchema))
        })

        it('should have the correct schema for get_file', () => {
            const schema = DEDAULT_TOOLS_SCHEMA.get_file

            expect(schema.name).toBe('get_file')
            expect(schema.description).toContain('retrieve full content')
            expect(schema.schema).toEqual(zodToolSchema(GetFileSchema))
        })

        it('should have the correct schema for run_terminal_command', () => {
            const schema = DEDAULT_TOOLS_SCHEMA.run_terminal_command

            expect(schema.name).toBe('run_terminal_command')
            expect(schema.description).toContain('arbitrary terminal command')
            expect(schema.schema).toEqual(zodToolSchema(RunTerminalCommandSchema))
        })
    })
})

// Test for the new zodSchemaToJson function
describe('zodSchemaToJson', () => {
    getDefaultToolFunctions()
    it('should convert EditToolSchema to JSON schema', () => {
        const jsonSchema = zodSchemaToJson(EditToolSchema)

        expect(jsonSchema).toMatchObject({
            $schema: expect.any(String),
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    enum: ['create', 'str_replace', 'insert', 'undo_edit'],
                    description: 'The command to execute',
                },
                path: {
                    type: 'string',
                    description: 'The relative path of the file',
                },
                file_text: {
                    type: 'string',
                    description: 'The full contents of the new file for create command',
                },
                old_str: {
                    type: 'string',
                    description: 'String to replace',
                },
                new_str: {
                    type: 'string',
                    description: 'String to replace with',
                },
                insert_line: {
                    type: 'integer',
                    description: 'Line number to insert at',
                },
            },
            required: ['command', 'path'],
        })
    })

    it('should convert GetFileSchema to JSON schema', () => {
        const jsonSchema = zodSchemaToJson(GetFileSchema)

        expect(jsonSchema).toMatchObject({
            $schema: expect.any(String),
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The name of the file to retrieve',
                },
            },
            required: ['name'],
        })
    })

    it('should convert RunTerminalCommandSchema to JSON schema', () => {
        const jsonSchema = zodSchemaToJson(RunTerminalCommandSchema)
        console.log(jsonSchema)

        expect(jsonSchema).toMatchObject({
            $schema: expect.any(String),
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description:
                        'The command to run in the root of the users project. Must be shell escaped.',
                },
                danger: {
                    type: 'boolean',
                    description:
                        'Whether the command is dangerous. If true, user will be asked to confirm.',
                    default: false,
                },
            },
            required: ['command'],
        })
    })

    it('should convert GetDiagnosticSchema to JSON schema', () => {
        const jsonSchema = zodSchemaToJson(GetDiagnosticSchema)
        console.log(jsonSchema)

        expect(jsonSchema).toMatchObject({
            $schema: expect.any(String),
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description:
                        'The name of the file for which to retrieve diagnostics from. Put "*" to get all diagnostics from current codebase.',
                },
                type: {
                    type: 'string',
                    enum: ['error', 'warning', 'all'],
                    description:
                        'The type of diagnostics to retrieve. Default to error type when not specificied.',
                },
            },
            required: ['name'],
        })
    })

    it('should convert CodeSearchSchema to JSON schema', () => {
        const jsonSchema = zodSchemaToJson(CodeSearchSchema)

        expect(jsonSchema).toMatchObject({
            $schema: expect.any(String),
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Keyword query to search for.',
                },
            },
            required: ['query'],
        })
    })
})

// Test for comparing DEDAULT_TOOLS_SCHEMA with JSON schema
describe('DEDAULT_TOOLS_SCHEMA JSON Format', () => {
    it('should match the expected JSON schema format', () => {
        // Convert the tools schema to JSON format
        const jsonSchemas = convertToolsSchemasToJson(DEDAULT_TOOLS_SCHEMA)

        // Verify each tool has the correct properties
        expect(jsonSchemas.get_diagnostic).toHaveProperty('name')
        expect(jsonSchemas.get_diagnostic).toHaveProperty('description')
        expect(jsonSchemas.get_diagnostic).toHaveProperty('input_schema')
        expect(jsonSchemas.get_diagnostic).toHaveProperty('input_schema_json')

        expect(jsonSchemas.text_editor).toHaveProperty('name')
        expect(jsonSchemas.text_editor).toHaveProperty('description')
        expect(jsonSchemas.text_editor).toHaveProperty('input_schema')
        expect(jsonSchemas.text_editor).toHaveProperty('input_schema_json')

        expect(jsonSchemas.code_search).toHaveProperty('name')
        expect(jsonSchemas.code_search).toHaveProperty('description')
        expect(jsonSchemas.code_search).toHaveProperty('input_schema')
        expect(jsonSchemas.code_search).toHaveProperty('input_schema_json')

        expect(jsonSchemas.get_file).toHaveProperty('name')
        expect(jsonSchemas.get_file).toHaveProperty('description')
        expect(jsonSchemas.get_file).toHaveProperty('input_schema')
        expect(jsonSchemas.get_file).toHaveProperty('input_schema_json')

        expect(jsonSchemas.run_terminal_command).toHaveProperty('name')
        expect(jsonSchemas.run_terminal_command).toHaveProperty('description')
        expect(jsonSchemas.run_terminal_command).toHaveProperty('input_schema')
        expect(jsonSchemas.run_terminal_command).toHaveProperty('input_schema_json')

        // Verify the JSON schema for get_diagnostic
        const getDiagnosticSchema = jsonSchemas.get_diagnostic.input_schema_json
        expect(getDiagnosticSchema).toHaveProperty('properties.name')
        expect(getDiagnosticSchema).toHaveProperty('properties.type')

        // Verify the JSON schema for text_editor
        const textEditorSchema = jsonSchemas.text_editor.input_schema_json
        expect(textEditorSchema).toHaveProperty('properties.command')
        expect(textEditorSchema).toHaveProperty('properties.path')
        expect(textEditorSchema).toHaveProperty('properties.file_text')
        expect(textEditorSchema).toHaveProperty('properties.old_str')
        expect(textEditorSchema).toHaveProperty('properties.new_str')
        expect(textEditorSchema).toHaveProperty('properties.insert_line')
    })
})
