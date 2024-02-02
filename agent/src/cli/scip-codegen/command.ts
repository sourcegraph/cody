import fspromises from 'fs/promises'
import { Command } from 'commander'
import { KotlinCodegen } from './KotlinCodegen'
import { scip } from './scip'
import { SymbolTable } from './SymbolTable'
import { ConsoleReporter } from './ConsoleReporter'

export interface CodegenOptions {
    input: string
    output: string
    language: string
    protocol: string
    kotlinPackage: string
    severity: string
}

const command = new Command('scip-codegen')
    .option('--input <path>', 'path to SCIP file', 'index.scip')
    .option('--output <directory>', 'path where to generate bindings')
    .option('--language <value>', 'what programming language to generate the bindings', 'kotlin')
    .option('--protocol <value>', 'what protocol to generate bindings for', 'agent')
    .option('--severity <warning|error>', 'what protocol to generate bindings for', 'error')
    .option(
        '--kotlin-package <value>',
        'what package name to use for the kotlin classes',
        'com.sourcegraph.cody.protocol_generated'
    )
    .action(async (options: CodegenOptions) => {
        const bytes = await fspromises.readFile(options.input)
        if (options.language === 'kotlin') {
            const index = scip.Index.deserialize(bytes)
            const symtab = new SymbolTable(index)
            const reporter = new ConsoleReporter(index, { severity: options.severity as any })
            const codegen = new KotlinCodegen(options, symtab, reporter)
            await codegen.run()

            if (reporter.hasErrors()) {
                reporter.reportErrorCount()
                process.exit(1)
            }
        } else {
            console.error(`unknown language: ${options.language}`)
            process.exit(1)
        }
    })

const args = process.argv.slice(2)

command.parseAsync(args, { from: 'user' }).catch(error => {
    console.error(error)
    process.exit(1)
})
