import { isNullOrUndefinedOrUnknownType } from './isNullOrUndefinedOrUnknownType'
import type { scip } from './scip'
import type { SymbolTable } from './SymbolTable'
import { capitalize, typescriptKeywordSyntax } from './utils'

export class KotlinFormatter {
    constructor(private readonly symtab: SymbolTable) {}
    public functionName(info: scip.SymbolInformation): string {
        return info.display_name.replaceAll('$/', '').replaceAll('/', '_')
    }

    public typeName(info: scip.SymbolInformation): string {
        if (info.display_name === 'URI') {
            // HACK, just need to get this compiling
            return 'Uri'
        }
        return info.display_name
            .replaceAll('$/', '')
            .split('/')
            .map(part => capitalize(part))
            .join('_')
    }

    public jsonrpcMethodParameter(jsonrpcMethod: scip.SymbolInformation): {
        parameterSyntax: string
        parameterType: scip.Type
    } {
        const parameterType = jsonrpcMethod.signature.value_signature.tpe.type_ref.type_arguments[0]
        const parameterSyntax = this.jsonrpcTypeName(jsonrpcMethod, parameterType, 'parameter')
        return { parameterType, parameterSyntax: `params: ${parameterSyntax}` }
    }

    public jsonrpcTypeName(
        jsonrpcMethod: scip.SymbolInformation,
        parameterOrResultType: scip.Type,
        kind: 'parameter' | 'result'
    ): string {
        if (parameterOrResultType.has_type_ref) {
            if (this.isRecord(parameterOrResultType.type_ref.symbol)) {
                const [k, v] = parameterOrResultType.type_ref.type_arguments
                const key = this.jsonrpcTypeName(jsonrpcMethod, k, kind)
                const value = this.jsonrpcTypeName(jsonrpcMethod, v, kind)
                return `Map<${key}, ${value}>`
            }
            const keyword = typescriptKeywordSyntax(parameterOrResultType.type_ref.symbol)
            if (keyword === 'List') {
                const elementType = this.jsonrpcTypeName(
                    jsonrpcMethod,
                    parameterOrResultType.type_ref.type_arguments[0],
                    kind
                )
                return `List<${elementType}>`
            }
            if (keyword) {
                return keyword
            }
            const name = this.typeName(this.symtab.info(parameterOrResultType.type_ref.symbol))
            if (name === 'Map') {
                console.log(JSON.stringify(parameterOrResultType.toObject(), null, 2))
            }
            return name
        }

        if (
            parameterOrResultType.has_constant_type &&
            parameterOrResultType.constant_type.constant.has_string_constant
        ) {
            return 'String'
        }

        if (
            parameterOrResultType.has_constant_type &&
            parameterOrResultType.constant_type.constant.has_int_constant
        ) {
            return 'Int'
        }

        if (parameterOrResultType.has_structural_type || parameterOrResultType.has_intersection_type) {
            const suffix = kind === 'parameter' ? 'Params' : 'Result'
            return this.typeName(jsonrpcMethod) + suffix
        }

        if (parameterOrResultType.has_union_type) {
            if (
                parameterOrResultType.union_type.types.every(
                    type => type.has_constant_type && type.constant_type.constant.has_string_constant
                )
            ) {
                return 'String'
            }
            const nonNullTypes = parameterOrResultType.union_type.types.filter(
                type => !isNullOrUndefinedOrUnknownType(type)
            )
            if (nonNullTypes.length === 1) {
                return this.jsonrpcTypeName(jsonrpcMethod, nonNullTypes[0], kind)
            }

            const exceptionIndex = this.unionTypeExceptionIndex[jsonrpcMethod.symbol]
            if (exceptionIndex !== undefined) {
                return this.jsonrpcTypeName(jsonrpcMethod, nonNullTypes[exceptionIndex], kind)
            }
        }

        throw new Error(
            `no syntax: ${JSON.stringify(
                {
                    jsonrpcMethod: jsonrpcMethod.toObject(),
                    parameterOrResultType: parameterOrResultType.toObject(),
                },
                null,
                2
            )}`
        )
    }

    public readonly ignoredProperties = [
        ' src/jsonrpc/`agent-protocol.ts`/parameters0:',
        'marketingTracking0:', // Too complicated signature
    ]
    public readonly ignoredSymbols = new Set<string>([
        'scip-typescript npm cody-ai 1.4.3 src/jsonrpc/`agent-protocol.ts`/marketingTracking0:',
        'scip-typescript npm @sourcegraph/telemetry 0.16.0 dist/api/`index.d.ts`/Maybe#',
        'scip-typescript npm @sourcegraph/telemetry 0.16.0 dist/`index.d.ts`/TelemetryEventParameters#',
        'scip-typescript npm cody-ai 1.4.3 src/completions/`logger.ts`/_opaque1:',
        'scip-typescript npm cody-ai 1.4.3 src/completions/`logger.ts`/_opaque2:',
        'scip-typescript npm typescript 5.3.3 lib/`lib.es5.d.ts`/Record#', // TODO
    ])

    public readonly unionTypeExceptionIndex: Record<string, number> = {
        'scip-typescript npm @types/vscode 1.80.0 `index.d.ts`/description0:': 0,
        'scip-typescript npm @types/vscode 1.80.0 `index.d.ts`/iconPath0:': 0,
    }

    public isRecord(symbol: string): boolean {
        return (
            symbol.endsWith(' lib/`lib.es5.d.ts`/Record#') ||
            symbol.endsWith(' lib/`lib.es2015.collection.d.ts`/Map#')
        )
    }
}
