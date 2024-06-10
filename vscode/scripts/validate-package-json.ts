import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import axios from 'axios'

async function main() {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
    const schemaJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.schema.json'), 'utf-8')
    )

    const ajv = new Ajv({
        allErrors: true,
        allowUnionTypes: true,
        allowMatchingProperties: true,
        strict: false,
        loadSchema: fetchRemoteSchema,
    })
    addFormats(ajv)

    const validate = await ajv.compileAsync(schemaJson)
    const valid = validate(packageJson)

    if (!valid) {
        console.error('The package.json file does not match the Cody specific manifest schema.')
        console.error(JSON.stringify(validate.errors, null, 2))
        process.exit(1)
    }
}

async function fetchRemoteSchema(uri: string): Promise<object> {
    try {
        const response = await axios.get(uri)
        return response.data
    } catch (error) {
        throw new Error(`Failed to fetch remote schema: ${error}`)
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
