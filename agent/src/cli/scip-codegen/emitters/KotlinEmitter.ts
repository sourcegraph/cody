import type { CodePrinter } from '../../../../../vscode/src/completions/context/retrievers/tsc/CodePrinter'
import { type ConstantType, type DiscriminatedUnion, typeOfUnion } from '../BaseCodegen'
import type { Codegen } from '../Codegen'
import { Formatter, type LanguageOptions } from '../Formatter'
import type { SymbolTable } from '../SymbolTable'
import type { CodegenOptions } from '../command'
import { TypescriptKeyword, capitalize } from '../utils'
import type {
    DataClassOptions,
    Emitter,
    Enum,
    ProtocolInterface,
    SealedClassOptions,
    TypeAliasOptions,
    TypeOptions,
} from './Emitter'

export class KotlinEmitter implements Emitter {
    formatter: KotlinFormatter
    constructor(
        private options: CodegenOptions,
        symtab: SymbolTable,
        codegen: Codegen
    ) {
        this.formatter = new KotlinFormatter(symtab, codegen)
    }

    emitStringLiteralConstants(p: CodePrinter, stringLiterals: string[]): void {
        p.line('@file:Suppress("unused", "ConstPropertyName")')
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('object Constants {')
        p.block(() => {
            for (const literal of stringLiterals) {
                p.line(`const val ${this.formatter.formatFieldName(literal)} = "${literal}"`)
            }
        })
        p.line('}')
    }

    emitNullAlias(p: CodePrinter): void {
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('typealias Null = Void?')
    }

    emitSerializationAdapter(p: CodePrinter, discriminatedUnions: string[]): void {
        p.line('@file:Suppress("unused", "ConstPropertyName")')
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('object ProtocolTypeAdapters {')

        p.block(() => {
            p.line('fun register(gson: com.google.gson.GsonBuilder) {')
            p.block(() => {
                for (const name of discriminatedUnions) {
                    p.line(`gson.registerTypeAdapter(${name}::class.java, ${name}.deserializer)`)
                }
            })
            p.line('}')
        })
        p.line('}')
    }

    emitProtocolInterface(p: CodePrinter, { name, requests, notifications }: ProtocolInterface): void {
        p.line('@file:Suppress("FunctionName", "ClassName", "RedundantNullable")')
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;')
        p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;')
        p.line('import java.util.concurrent.CompletableFuture;')
        p.line()
        p.line('@Suppress("unused")')
        p.line(`interface ${name} {`)
        p.block(() => {
            p.sectionComment('Requests')
            for (const request of requests) {
                const resultType = request.signature.value_signature.tpe.type_ref.type_arguments?.[1]
                const { parameterSyntax } = this.formatter.jsonrpcMethodParameter(request)
                const resultTypeSyntax = this.formatter.jsonrpcTypeName(request, resultType, 'result')
                p.line(`@JsonRequest("${request.display_name}")`)
                p.line(
                    `fun ${this.formatter.functionName(
                        request
                    )}(${parameterSyntax}): CompletableFuture<${resultTypeSyntax}>`
                )
            }
            p.line()
            p.sectionComment('Notifications')
            for (const notification of notifications) {
                // Process a JSON-RPC request signature. For example:
                // type Notifications = { 'textDocument/inlineCompletions': [NotificationParams] }
                const { parameterSyntax } = this.formatter.jsonrpcMethodParameter(notification)
                const notificationName = this.formatter.functionName(notification)
                p.line(`@JsonNotification("${notification.display_name}")`)
                p.line(`fun ${notificationName}(${parameterSyntax})`)
            }
        })

        p.line('}')
    }

    startType(p: CodePrinter, _: TypeOptions): void {
        p.line('@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")')
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
    }

    closeType(p: CodePrinter, _: TypeOptions): void {
        p.line()
    }

    emitTypeAlias(p: CodePrinter, { name, alias }: TypeAliasOptions): void {
        p.line(`typealias ${name} = ${alias}`)
    }

    startSealedClass(p: CodePrinter, { name, union }: SealedClassOptions): void {
        function getDeserializer(union: DiscriminatedUnion): string {
            switch (typeOfUnion(union)) {
                case 'boolean':
                    return 'getAsBoolean'
                case 'number':
                    return 'getAsInt'
                case 'string':
                    return 'getAsString'
            }
        }
        function formatValueLiteral(value: ConstantType): string {
            switch (typeof value) {
                case 'string':
                    return `"${value}"`
                case 'number':
                    return value.toString()
                case 'boolean':
                    return value.toString()
            }
        }
        p.line('import com.google.gson.Gson;')
        p.line('import com.google.gson.JsonDeserializationContext;')
        p.line('import com.google.gson.JsonDeserializer;')
        p.line('import com.google.gson.JsonElement;')
        p.line('import java.lang.reflect.Type;')
        p.line()
        p.line(`sealed class ${name} {`)
        p.block(() => {
            p.line('companion object {')
            p.block(() => {
                p.line(`val deserializer: JsonDeserializer<${name}> =`)
                p.block(() => {
                    p.line(
                        'JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->'
                    )
                    p.block(() => {
                        p.line(
                            `when (element.getAsJsonObject().get("${
                                union.discriminatorDisplayName
                            }").${getDeserializer(union)}()) {`
                        )
                        p.block(() => {
                            for (const member of union.members) {
                                const typeName = this.formatter.discriminatedUnionTypeName(union, member)
                                p.line(
                                    `${formatValueLiteral(
                                        member.value
                                    )} -> context.deserialize<${typeName}>(element, ${typeName}::class.java)`
                                )
                            }
                            if (typeOfUnion(union) !== 'boolean') {
                                p.line('else -> throw Exception("Unknown discriminator ${element}")')
                            }
                        })
                        p.line('}')
                    })
                    p.line('}')
                })
            })
            p.line('}')
        })
        p.line('}')
    }

    emitDataClass(
        p: CodePrinter,
        { name, members, enums, parentClass, innerClass }: DataClassOptions
    ): void {
        if (innerClass) {
            p.line()
        }
        p.line(`data class ${name}(`)
        p.block(() => {
            for (const member of members) {
                p.line(
                    `val ${member.info.display_name}: ${member.typeSyntax}${
                        member.isNullable ? ' = null' : ''
                    },${member.oneOfComment}`
                )
            }
            if (members.length === 0) {
                p.line('val placeholderField: String? = null // Empty data class')
            }
        })
        const heritage = parentClass ? ` : ${parentClass}()` : ''
        if (enums.length === 0) {
            p.line(`)${heritage}`)
        } else {
            p.line(`)${heritage} {`)
            p.block(() => {
                p.addImport('import com.google.gson.annotations.SerializedName;')
                for (const enum_ of enums) {
                    this.emitEnum(p, enum_)
                }
            })
            p.line('}')
        }
    }

    emitEnum(p: CodePrinter, { name, members }: Enum): void {
        p.line()
        p.line(`enum class ${name} {`)
        p.block(() => {
            for (const member of members) {
                p.line(`@SerializedName("${member.serializedName}") ${member.formattedName},`)
            }
        })
        p.line('}')
    }

    getFileNameForType(tpe: string): string {
        return `${capitalize(tpe)}.${this.getFileType()}`
    }

    getFileType(): string {
        return 'kt'
    }
}

export class KotlinFormatter extends Formatter {
    public options: LanguageOptions = {
        typeNameSeparator: '_',
        typeAnnotations: 'after',
        nullableSyntax: '?',
        voidType: 'Null',
        reserved: new Set([
            'class',
            'interface',
            'object',
            'package',
            'typealias',
            'val',
            'var',
            'fun',
            'when',
        ]),
        keywordOverrides: new Map([
            [TypescriptKeyword.Null, 'Null'],
            [TypescriptKeyword.Object, 'Any'],
        ]),
    }

    override formatFieldName(name: string): string {
        const escaped = name.replace(':', '_').replace('/', '_')
        const isKeyword = this.options.reserved.has(escaped)
        const needsBacktick = isKeyword || !/^[a-zA-Z0-9_]+$/.test(escaped)
        // Replace all non-alphanumeric characters with underscores
        const fieldName = this.escape(escaped, '-')
        return needsBacktick ? `\`${fieldName}\`` : fieldName
    }

    public mapSyntax(key: string, value: string): string {
        return `Map<${key}, ${value}>`
    }

    public listSyntax(value: string): string {
        return `List<${value}>`
    }
}
