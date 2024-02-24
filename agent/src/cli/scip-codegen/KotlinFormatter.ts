import type { DiscriminatedUnion, DiscriminatedUnionMember } from './BaseCodegen'
import type { SymbolTable } from './SymbolTable'
import { isNullOrUndefinedOrUnknownType } from './isNullOrUndefinedOrUnknownType'
import type { scip } from './scip'
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

            const exceptionIndex = this.unionTypeExceptionIndex.find(({ prefix }) =>
                jsonrpcMethod.symbol.startsWith(prefix)
            )?.index
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

    // Hacky workaround: we are exposing a few tricky union types in the
    // protocol that don't have a clean encoding in other languages. We use this
    // list to manually pick one of the types in the union type.
    public readonly unionTypeExceptionIndex: { prefix: string; index: number }[] = [
        { prefix: 'scip-typescript npm @types/vscode ', index: 0 },
    ]

    public isRecord(symbol: string): boolean {
        return (
            symbol.endsWith(' lib/`lib.es5.d.ts`/Record#') ||
            symbol.endsWith(' lib/`lib.es2015.collection.d.ts`/Map#')
        )
    }

    // Incomplete, but useful list of keywords. Thank you Cody!
    private kotlinKeywords = new Set([
        'class',
        'interface',
        'object',
        'package',
        'typealias',
        'val',
        'var',
        'fun',
    ])

    public formatFieldName(name: string): string {
        const escaped = name.replace(':', '_').replace('/', '_')
        const isKeyword = this.kotlinKeywords.has(escaped)
        const needsBacktick = isKeyword || !/^[a-zA-Z0-9_]+$/.test(escaped)
        return needsBacktick ? `\`${escaped}\`` : escaped
    }

    public discriminatedUnionTypeName(
        union: DiscriminatedUnion,
        member: DiscriminatedUnionMember
    ): string {
        if (member.type.has_type_ref) {
            return this.symtab.info(member.type.type_ref.symbol).display_name
        }
        return capitalize(
            this.formatFieldName(member.value + this.symtab.info(union.symbol).display_name)
        )
    }
    public formatEnumType(name: string): string {
        return `${capitalize(name)}Enum`
    }
}
