import type { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'
import { DEDAULT_TOOLS_SCHEMA } from '../tools/schema'

/**
 * Converts a Zod schema to JSON schema format
 * This is useful for generating documentation or for testing schema structure
 *
 * @param schema The Zod schema to convert
 * @param options Optional configuration options for the conversion
 * @returns A JSON schema representation of the Zod schema
 */
export function zodSchemaToJson(schema: z.ZodType<any>, options?: { name?: string }): object {
    return zodToJsonSchema(schema, options)
}

/**
 * Converts all schemas in DEDAULT_TOOLS_SCHEMA to JSON format
 * This can be used to generate documentation or validate schema structure
 *
 * @param toolsSchema The tools schema object to convert
 * @returns An object with the same keys but with JSON schema values
 */
export function convertToolsSchemasToJson(toolsSchema: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [key, value] of Object.entries(toolsSchema)) {
        result[key] = { ...value }

        // Only add input_schema_json if input_schema exists
        if (value.input_schema) {
            result[key].input_schema_json = value.input_schema
        }
        console.log(`Converting schema for ${key} to JSON format`, zodToJsonSchema(value.input_schema))
    }

    return result
}

interface ToolFunction {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, any>
    }
}

// A function to convert the Zod schema to JSON schema format shown above
export function getDefaultToolFunctions(): Map<string, ToolFunction> {
    const toolFunctions = new Map<string, ToolFunction>()
    for (const [_, value] of Object.entries(DEDAULT_TOOLS_SCHEMA)) {
        toolFunctions.set(value.name, getToolFunctionSchema(value.name, value.description, value.schema))
    }
    return toolFunctions
}

export function getToolFunctionSchema(
    name: string,
    description: string,
    zodSchema: z.ZodType<any>
): ToolFunction {
    const jsonSchema = zodToJsonSchema(zodSchema, { name: name })
    // Extract the actual schema definition from the definitions object
    const schemaName = name
    const actualSchema = jsonSchema.definitions?.[schemaName] || {}
    const toolFunction: ToolFunction = {
        type: 'function',
        function: {
            name: name,
            description: description,
            parameters: actualSchema,
        },
    }
    return toolFunction
}
