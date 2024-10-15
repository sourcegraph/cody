import type { DiscriminatedUnion, DiscriminatedUnionMember } from './BaseCodegen'
import type { Codegen } from './Codegen'
import type { SymbolTable } from './SymbolTable'
import { isNullOrUndefinedOrUnknownType } from './isNullOrUndefinedOrUnknownType'
import type { scip } from './scip'
import { TypescriptKeyword, capitalize, typescriptKeyword, typescriptKeywordSyntax } from './utils'

export interface LanguageOptions {
    typeNameSeparator: string
    typeAnnotations: 'before' | 'after'
    voidType: string
    nullableSyntax?: string
    reserved: Set<string>
    keywordOverrides: Map<TypescriptKeyword, string>
}
export abstract class Formatter {
    constructor(
        private readonly symtab: SymbolTable,
        private codegen: Codegen
    ) {}

    public abstract options: LanguageOptions
    public abstract mapSyntax(key: string, value: string): string
    public abstract listSyntax(elementType: string): string
    public abstract formatFieldName(name: string): string

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
            .join(this.options.typeNameSeparator)
    }

    public jsonrpcMethodParameter(jsonrpcMethod: scip.SymbolInformation): {
        parameterSyntax: string
        parameterType: scip.Type
    } {
        const parameterType = jsonrpcMethod.signature.value_signature.tpe.type_ref.type_arguments[0]
        const parameterSyntax = this.jsonrpcTypeName(jsonrpcMethod, parameterType, 'parameter')
        if (this.options.typeAnnotations === 'after') {
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
        if (this.options.nullableSyntax && this.isNullable(tpe)) {
            return this.options.nullableSyntax
        }
        return ''
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
                return this.mapSyntax(key, value)
            }
            const keyword = typescriptKeywordSyntax(parameterOrResultType.type_ref.symbol)
            if (keyword === TypescriptKeyword.List) {
                const elementType = this.jsonrpcTypeName(
                    jsonrpcMethod,
                    parameterOrResultType.type_ref.type_arguments[0],
                    kind
                )
                return this.listSyntax(elementType)
            }
            if (keyword) {
                return this.options.keywordOverrides.get(keyword) ?? keyword
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
            if (nonNullableTypes.length === 0) {
                return this.options.voidType
            }
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

    public readonly ignoredInfoSymbol: string[] = []

    public readonly ignoredProperties = [
        'npm @sourcegraph/telemetry ', // Too many complicated types from this package
        '`inline-completion-item-provider-config-singleton.ts`/tracer0:',
        '`observable.d.ts`/Subscription#',
        '`provider.ts`/Provider#configSource',
        '`StatusBar.ts`/CodyStatusBar',
    ]
    private readonly ignoredTypeRefs = [
        '`provider.ts`/Provider#',
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

    public isIgnoredInfo(info: scip.SymbolInformation): boolean {
        for (const ignored of this.ignoredInfoSymbol) {
            if (info.symbol.includes(ignored)) {
                return true
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

    protected escape(name: string, replacer: '_' | '-' = '_'): string {
        const nonAlphanumericRegex = replacer === '-' ? /[^a-zA-Z0-9]+/g : /[^a-zA-Z0-9]/g
        const repeatedReplacerRegex = new RegExp(`${replacer}+`, 'g')
        const trimReplacerRegex = new RegExp(`^${replacer}|${replacer}$`, 'g')

        return name
            .replace(nonAlphanumericRegex, replacer)
            .replace(repeatedReplacerRegex, replacer)
            .replace(trimReplacerRegex, '')
    }
}
