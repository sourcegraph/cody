import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { convertToolsSchemasToJson, zodSchemaToJson } from './schema-utils'

describe('Schema Utils', () => {
    describe('zodSchemaToJson', () => {
        it('should convert a simple Zod schema to JSON schema', () => {
            const schema = z.object({
                name: z.string().describe('The name'),
                age: z.number().describe('The age'),
                isActive: z.boolean().optional().describe('Whether the user is active'),
            })

            const jsonSchema = zodSchemaToJson(schema)

            expect(jsonSchema).toMatchObject({
                $schema: expect.any(String),
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The name',
                    },
                    age: {
                        type: 'number',
                        description: 'The age',
                    },
                    isActive: {
                        type: 'boolean',
                        description: 'Whether the user is active',
                    },
                },
                required: ['name', 'age'],
            })
        })

        it('should use the provided name in options', () => {
            const schema = z.object({
                name: z.string(),
            })

            const jsonSchema = zodSchemaToJson(schema, { name: 'TestSchema' })

            expect(jsonSchema).toMatchObject({
                $schema: expect.any(String),
                title: 'TestSchema',
            })
        })
    })

    describe('convertToolsSchemasToJson', () => {
        it('should convert tool schemas to JSON format', () => {
            const mockToolsSchema = {
                test_tool: {
                    name: 'test_tool',
                    description: 'A test tool',
                    input_schema: {
                        type: 'object',
                        properties: {
                            param1: { type: 'string' },
                        },
                    },
                },
                another_tool: {
                    name: 'another_tool',
                    description: 'Another test tool',
                    input_schema: {
                        type: 'object',
                        properties: {
                            param2: { type: 'number' },
                        },
                    },
                },
            }

            const result = convertToolsSchemasToJson(mockToolsSchema)

            expect(Object.keys(result)).toEqual(['test_tool', 'another_tool'])
            expect(result.test_tool).toHaveProperty('input_schema_json')
            expect(result.another_tool).toHaveProperty('input_schema_json')
            expect(result.test_tool.input_schema_json).toEqual(mockToolsSchema.test_tool.input_schema)
            expect(result.another_tool.input_schema_json).toEqual(
                mockToolsSchema.another_tool.input_schema
            )
        })

        it('should handle tools without input_schema', () => {
            const mockToolsSchema = {
                test_tool: {
                    name: 'test_tool',
                    description: 'A test tool',
                    // No input_schema
                },
            }

            const result = convertToolsSchemasToJson(mockToolsSchema)

            expect(result.test_tool).not.toHaveProperty('input_schema_json')
            expect(result.test_tool).toEqual(mockToolsSchema.test_tool)
        })
    })
})
