import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import axios from 'axios'

const UPDATE_USAGE = 'You can update the cache by running: UPDATE=1 pnpm run check:manifest'

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
        loadSchema: process.env.UPDATE ? fetchRemoteSchema : fetchCachedSchema,
    })
    addFormats(ajv)

    const validate = await ajv.compileAsync(schemaJson)
    const valid = validate(packageJson)

    if (!valid) {
        console.error('The package.json file does not match the Cody specific manifest schema.')
        if (!process.env.UPDATE) {
            console.warn('Used cached schemas. ' + UPDATE_USAGE)
        }
        console.error(JSON.stringify(validate.errors, null, 2))
        process.exit(1)
    }
}

function uriToCacheFile(uri: string): string {
    const cacheDir = path.join(process.cwd(), '.schema-cache')
    return path.join(cacheDir, encodeURIComponent(uri))
}

async function fetchRemoteSchema(uri: string): Promise<object> {
    try {
        const response = await axios.get(uri)
        const cacheFile = uriToCacheFile(uri)
        fs.writeFileSync(cacheFile, JSON.stringify(response.data))
        return response.data
    } catch (error) {
        throw new Error(`Failed to fetch remote schema: ${error}`)
    }
}

async function fetchCachedSchema(uri: string): Promise<object> {
    const cacheFile = uriToCacheFile(uri)
    if (fs.existsSync(cacheFile)) {
        const cachedData = fs.readFileSync(cacheFile, 'utf-8')
        return JSON.parse(cachedData)
    }
    throw new Error(`Cached schema not found for URI: ${uri}. ${UPDATE_USAGE}`)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
