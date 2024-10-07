import fs from 'node:fs/promises'

export function detectForbiddenImportPlugin(allForbiddenModules) {
    return {
        name: 'detect-forbidden-import-plugin',
        setup(build) {
            build.onResolve({ filter: /.*/ }, args => {
                for (const forbidden of allForbiddenModules) {
                    if (args.path === forbidden) {
                        throw new Error(`'${forbidden}' module is imported in file: ${args.importer}`)
                    }
                }
                args
            })

            build.onLoad({ filter: /.*/ }, async args => {
                const contents = await fs.readFile(args.path, 'utf8')
                return { contents, loader: 'default' }
            })
        },
    }
}
