import fspromises from 'node:fs/promises'
import path from 'node:path'
import { BaseCodegen } from './BaseCodegen'
import { CodePrinter } from './CodePrinter'
import { resetOutputPath } from './resetOutputPath'
import type { scip } from './scip'

export class TypeScriptCodegen extends BaseCodegen {
    public queue: scip.SymbolInformation[] = []
    public generatedSymbols = new Set<string>()

    public async run(): Promise<void> {
        await resetOutputPath(this.options.output)
        const p = new CodePrinter()
        p.line('import * as rpc from "vscode-jsonrpc/node";')
        p.sectionComment('Client->Server')
        this.addMethods(p, BaseCodegen.protocolSymbols.client.requests)
        this.addMethods(p, BaseCodegen.protocolSymbols.client.notifications)

        p.sectionComment('Server->Client')
        this.addMethods(p, BaseCodegen.protocolSymbols.server.requests)
        this.addMethods(p, BaseCodegen.protocolSymbols.server.notifications)
        await fspromises.writeFile(path.join(this.options.output, 'protocol.ts'), p.build())
    }

    public addMethods(p: CodePrinter, symbol: string): void {
        for (const method of this.symtab.structuralType(this.symtab.canonicalSymbol(symbol))) {
            // Process a JSON-RPC request signature. For example:
            // type Requests = { 'textDocument/inlineCompletions': [RequestParams, RequestResult] }
            const typeArguments = method.signature.value_signature.tpe.type_ref.type_arguments
            const isRequest = typeArguments.length > 1
            const parameterType = this.syntax(
                method.signature.value_signature.tpe.type_ref.type_arguments[0]
            )
            const methodVariableName = method.display_name.replaceAll('/', '_')
            if (isRequest) {
                const resultType = this.syntax(
                    method.signature.value_signature.tpe.type_ref.type_arguments[1]
                )
                p.line(
                    `const ${methodVariableName} = new rpc.RequestType<${parameterType}, ${resultType}, void>(${method.display_name})`
                )
            } else {
                p.line(
                    `const ${methodVariableName} = new rpc.NotificationType<${parameterType}, void>(${method.display_name})`
                )
            }
        }
    }

    private syntax(tpe: scip.Type): string {
        if (tpe.has_type_ref) {
            return this.symtab.info(tpe.type_ref.symbol).display_name
        }
        return 'TODO'
    }
}
