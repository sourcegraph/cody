import assert from 'node:assert'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dedent from 'dedent'
import jsonSchemaToZod from 'json-schema-to-zod'
// import { z } from 'zod'

const ROOT_DIR = path.join(__dirname, '..')
async function main() {
    //TODO: pass target file as arg
    const targetFilePath = path.join(ROOT_DIR, 'src', 'config-v2.ts')
    const targetFile = await fs.readFile(targetFilePath, 'utf-8')

    const packageJson = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
    const publicConfigs = packageJson?.contributes?.configuration
    assert(publicConfigs)
    const publicSchema = jsonSchemaToZod(publicConfigs)

    const hiddenConfigs = JSON.parse(
        await fs.readFile(path.join(ROOT_DIR, 'config.hidden.json'), 'utf-8')
    )
    const hiddenSchema = jsonSchemaToZod(hiddenConfigs)
    const schemaBlock = dedent(
        `
    /** START_GENERATED_ZOD_SCHEMA **/
    /*
    * This block is automatically populated by the scripts/generate-config-schema.ts script.
    * Do not edit this block manually.
    */
    const publicSchema = ${publicSchema}
    const hiddenSchema = ${hiddenSchema}
    /** END_GENERATED_ZOD_SCHEMA **/
    `
    )

    const targetBlock = targetFile.match(
        /\/\*\* START_GENERATED_ZOD_SCHEMA \*\*\/.*\/\*\* END_GENERATED_ZOD_SCHEMA \*\*\//s
    )
    assert(targetBlock)

    const patchedFile = targetFile
        .slice(0, targetBlock.index)
        .concat(schemaBlock)
        .concat(targetFile.slice(targetBlock.index! + targetBlock[0].length))
    await fs.writeFile(targetFilePath, patchedFile)
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
