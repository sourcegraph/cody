import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// one level up from __dirname
const projectDir = path.join(__dirname, '..')
console.log(projectDir)
async function main() {
    const tsconfig = await fs.promises.readFile(path.join(projectDir, 'tsconfig.json'), 'utf-8')
    const parsedConfig = ts.parseConfigFileTextToJson('tsconfig.json', tsconfig)
    if (parsedConfig.error) {
        throw new Error(parsedConfig.error.messageText?.toString() ?? 'Could not parse tsconfig.json')
    }
    parsedConfig.config.exclude = parsedConfig.config.exclude.filter((e: string) => e !== 'typehacks')
    parsedConfig.config.compilerOptions.noEmit = true
    parsedConfig.config.include.push('typehacks/*.ts')

    await fs.promises.writeFile(
        path.join(projectDir, 'tsconfig.typehacks.json'),
        JSON.stringify(parsedConfig.config)
    )
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
