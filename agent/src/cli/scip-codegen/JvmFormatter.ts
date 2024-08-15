import type { DiscriminatedUnion, DiscriminatedUnionMember } from './BaseCodegen'
import { type JvmCodegen, JvmLanguage } from './JvmCodegen'
import type { SymbolTable } from './SymbolTable'
import { isNullOrUndefinedOrUnknownType } from './isNullOrUndefinedOrUnknownType'
import type { scip } from './scip'
import { capitalize, typescriptKeyword, typescriptKeywordSyntax } from './utils'

export class JvmFormatter {
    constructor(
        private readonly language: JvmLanguage,
        private readonly symtab: SymbolTable,
        private codegen: JvmCodegen
    ) {}
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
        if (this.language === JvmLanguage.Kotlin) {
            return { parameterType, parameterSyntax: `params: ${parameterSyntax}` }
        }
        return { parameterType, parameterSyntax: `${parameterSyntax} params` }
    }

    public isNullish(symbol: string): boolean {
        return symbol === typescriptKeyword('undefined') || symbol === typescriptKeyword('null')
    }

    public isNullableInfo(info: scip.SymbolInformation): boolean {
        return this.isNullable(info.signature.value_signature.tpe)
    }
    public nullableSyntax(tpe: scip.Type): string {
        if (this.language === JvmLanguage.Java) {
            // TODO: emit @Nullable
            return ''
        }
        return this.isNullable(tpe) ? '?' : ''
    }
    public isNullable(tpe: scip.Type): boolean {
        if (tpe.has_type_ref) {
            return this.isNullish(tpe.type_ref.symbol)
        }
        return (
            tpe.has_union_type &&
            tpe.union_type.types.length >= 2 &&
            tpe.union_type.types.some(t => this.isNullable(t))
        )
    }

    public jsonrpcTypeName(
        jsonrpcMethod: scip.SymbolInformation,
        parameterOrResultType: scip.Type,
        kind: 'parameter' | 'result'
    ): string {
        return (
            this.nonNullableJsonrpcTypeName(jsonrpcMethod, parameterOrResultType, kind) +
            this.nullableSyntax(parameterOrResultType)
        )
    }

    public nonNullableJsonrpcTypeName(
        jsonrpcMethod: scip.SymbolInformation,
        parameterOrResultType: scip.Type,
        kind: 'parameter' | 'result'
    ): string {
        if (parameterOrResultType.has_type_ref) {
            if (this.isRecord(parameterOrResultType.type_ref.symbol)) {
                const [k, v] = parameterOrResultType.type_ref.type_arguments
                const key = this.jsonrpcTypeName(jsonrpcMethod, k, kind)
                const value = this.jsonrpcTypeName(jsonrpcMethod, v, kind)
                if (this.language === JvmLanguage.Kotlin) {
                    return `Map<${key}, ${value}>`
                }
                return `java.util.Map<${key}, ${value}>`
            }
            const keyword = typescriptKeywordSyntax(this.language, parameterOrResultType.type_ref.symbol)
            if (keyword === 'List') {
                const elementType = this.jsonrpcTypeName(
                    jsonrpcMethod,
                    parameterOrResultType.type_ref.type_arguments[0],
                    kind
                )
                if (this.language === JvmLanguage.Kotlin) {
                    return `List<${elementType}>`
                }
                return `java.util.List<${elementType}>`
            }
            if (keyword) {
                return keyword
            }
            return this.typeName(this.symtab.info(parameterOrResultType.type_ref.symbol))
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
            return 'Long'
        }

        if (parameterOrResultType.has_structural_type || parameterOrResultType.has_intersection_type) {
            const suffix = kind === 'parameter' ? 'Params' : 'Result'
            return this.typeName(jsonrpcMethod) + suffix
        }

        if (parameterOrResultType.has_union_type) {
            const nonNullableTypes = parameterOrResultType.union_type.types.filter(
                tpe => !this.isNullable(tpe)
            )
            if (nonNullableTypes.length === 1) {
                return this.nonNullableJsonrpcTypeName(jsonrpcMethod, nonNullableTypes[0], kind)
            }

            if (nonNullableTypes.every(tpe => this.codegen.isStringType(tpe))) {
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
        'npm @sourcegraph/telemetry ', // Too many complicated types from this package
    ]
    private readonly ignoredTypeRefs = [
        'npm @sourcegraph/telemetry', // Too many complicated types from this package
        '/TelemetryEventParameters#',
        ' lib/`lib.es5.d.ts`/Omit#',
    ]

    public isIgnoredType(tpe: scip.Type): boolean {
        if (tpe.has_type_ref) {
            return this.ignoredTypeRefs.some(ref => tpe.type_ref.symbol.includes(ref))
        }

        if (tpe.has_union_type) {
            const nonNullableTypes = tpe.union_type.types.filter(tpe => !this.isNullable(tpe))
            if (nonNullableTypes.length === 1) {
                return this.isIgnoredType(nonNullableTypes[0])
            }
        }
        return false
    }

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
        'when',
    ])
    private javaKeywords = new Set([
        'class',
        'interface',
        'object',
        'package',
        'var',
        'default',
        'case',
        'switch',
        'native',
    ])

    public formatFieldName(name: string): string {
        const escaped = name.replace(':', '_').replace('/', '_')
        if (this.language === JvmLanguage.Kotlin) {
            const isKeyword = this.kotlinKeywords.has(escaped)
            const needsBacktick = isKeyword || !/^[a-zA-Z0-9_]+$/.test(escaped)
            return needsBacktick ? `\`${escaped}\`` : escaped
        }

        // Java
        const isKeyword = this.javaKeywords.has(escaped)
        if (isKeyword) {
            return escaped + '_'
        }
        return escaped.replace(/[^a-zA-Z0-9]/g, '_')
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
