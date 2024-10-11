import type { CodePrinter } from '../../../../../vscode/src/completions/context/retrievers/tsc/CodePrinter'
import {
    type ConstantType,
    type DiscriminatedUnion,
    type DiscriminatedUnionMember,
    typeOfUnion,
} from '../BaseCodegen'
import type { Codegen } from '../Codegen'
import { Formatter, type LanguageOptions } from '../Formatter'
import type { SymbolTable } from '../SymbolTable'
import type { CodegenOptions } from '../command'
import { TypescriptKeyword } from '../utils'
import type {
    DataClassOptions,
    Emitter,
    Enum,
    ProtocolInterface,
    SealedClassOptions,
    TypeAliasOptions,
    TypeOptions,
} from './Emitter'

export class JavaEmitter implements Emitter {
    formatter: JavaFormatter

    constructor(
        private options: CodegenOptions,
        symtab: SymbolTable,
        codegen: Codegen
    ) {
        this.formatter = new JavaFormatter(symtab, codegen)
    }

    emitSerializationAdapter(p: CodePrinter, discriminatedUnions: string[]): void {
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('public final class ProtocolTypeAdapters {')

        p.block(() => {
            p.line('public static void register(com.google.gson.GsonBuilder gson) {')
            p.block(() => {
                for (const name of discriminatedUnions) {
                    p.line(`gson.registerTypeAdapter(${name}.class, ${name}.deserializer());`)
                }
            })
            p.line('}')
        })
        p.line('}')
    }

    emitStringLiteralConstants(p: CodePrinter, stringLiterals: string[]): void {
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('public final class Constants {')

        p.block(() => {
            for (const literal of stringLiterals) {
                p.line(
                    `public static final String ${this.formatter.formatFieldName(
                        literal
                    )} = "${literal}";`
                )
            }
        })
        p.line('}')
    }

    emitNullAlias(p: CodePrinter): void {
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('public final class Null {}')
    }

    emitProtocolInterface(p: CodePrinter, { name, requests, notifications }: ProtocolInterface): void {
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;')
        p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;')
        p.line('import java.util.concurrent.CompletableFuture;')
        p.line()
        p.line('@SuppressWarnings("unused")')
        p.line(`public interface ${name} {`)

        p.block(() => {
            p.sectionComment('Requests')
            for (const request of requests) {
                const resultType = request.signature.value_signature.tpe.type_ref.type_arguments?.[1]
                const { parameterSyntax } = this.formatter.jsonrpcMethodParameter(request)
                const resultTypeSyntax = this.formatter.jsonrpcTypeName(request, resultType, 'result')
                p.line(`@JsonRequest("${request.display_name}")`)
                p.line(
                    `CompletableFuture<${resultTypeSyntax}> ${this.formatter.functionName(
                        request
                    )}(${parameterSyntax});`
                )
                p.line()
            }

            p.line()
            p.sectionComment('Notifications')
            for (const notification of notifications) {
                const { parameterSyntax } = this.formatter.jsonrpcMethodParameter(notification)
                p.line(`@JsonNotification("${notification.display_name}")`)
                p.line(`void ${this.formatter.functionName(notification)}(${parameterSyntax});`)
            }
        })

        p.line('}')
    }

    startType(p: CodePrinter, _: TypeOptions): void {
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
    }

    closeType(p: CodePrinter, _: TypeOptions): void {
        p.line()
    }

    emitTypeAlias(p: CodePrinter, { name, info, enum: enum_ }: TypeAliasOptions): void {
        if (name === 'Date') {
            p.line('public final class Date {}')
        } else if (info.display_name === 'Null') {
            p.line('public final class Null {}')
        }
        if (enum_) {
            this.emitEnum(p, enum_)
        } else {
            p.line(`public final class ${name} {} // TODO: fixme`)
        }
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
                default:
                    throw new TypeError('Invalid value type')
            }
        }

        const getDeserializationClause = (member?: DiscriminatedUnionMember): string | undefined => {
            if (!member) return undefined

            const typeName = member ? this.formatter.discriminatedUnionTypeName(union, member) : 'Void'
            return `return context.deserialize(element, ${typeName}.class);`
        }

        p.line('import com.google.gson.Gson;')
        p.line('import com.google.gson.JsonDeserializationContext;')
        p.line('import com.google.gson.JsonDeserializer;')
        p.line('import com.google.gson.JsonElement;')
        p.line('import java.lang.reflect.Type;')
        p.line()
        p.line(`public abstract class ${name} {`)
        p.block(() => {
            p.line(`public static JsonDeserializer<${name}> deserializer() {`)
            p.block(() => {
                p.line('return (element, _type, context) -> {')
                p.block(() => {
                    // In Java, we can't switch on booleans, so we have to use if-else
                    if (typeOfUnion(union) === 'boolean') {
                        const trueCase = union.members.find(m => m.value === true)
                        const falseCase = union.members.find(m => m.value === false)
                        p.line(
                            `if (element.getAsJsonObject().get("${union.discriminatorDisplayName}").getAsBoolean()) {`
                        )
                        p.block(() => {
                            p.line(getDeserializationClause(trueCase))
                        })
                        p.line('} else {')
                        p.block(() => {
                            p.line(getDeserializationClause(falseCase))
                        })
                        p.line('}')
                    } else {
                        p.line(
                            `switch (element.getAsJsonObject().get("${
                                union.discriminatorDisplayName
                            }").${getDeserializer(union)}()) {`
                        )
                        p.block(() => {
                            for (const member of union.members) {
                                const typeName = this.formatter.discriminatedUnionTypeName(union, member)
                                p.line(
                                    `case ${formatValueLiteral(
                                        member.value
                                    )}: return context.deserialize(element, ${typeName}.class);`
                                )
                            }
                            p.line(
                                'default: throw new RuntimeException("Unknown discriminator " + element);'
                            )
                        })
                        p.line('}')
                    }
                })
                p.line('};')
            })
            p.line('}')
        })
    }

    closeSealedClass(p: CodePrinter, _: SealedClassOptions): void {
        p.line('}')
    }

    emitDataClass(
        p: CodePrinter,
        { name, members, enums, innerClass, parentClass }: DataClassOptions
    ): void {
        const staticModifier = innerClass ? 'static ' : ''
        const heritage = parentClass ? ` extends ${parentClass}` : ''
        p.line(`public ${staticModifier}final class ${name}${heritage} {`)

        p.block(() => {
            for (const { info, typeSyntax, formattedName, oneOfComment } of members) {
                const serializedAnnotation =
                    formattedName === info.display_name
                        ? ''
                        : `@com.google.gson.annotations.SerializedName("${info.display_name}") `
                p.line(`${serializedAnnotation}public ${typeSyntax} ${formattedName};${oneOfComment}`)
            }
        })

        p.block(() => {
            for (const _enum of enums) {
                this.emitEnum(p, _enum)
            }
        })
        p.line('}')
    }

    emitEnum(p: CodePrinter, { name, members }: Enum): void {
        p.line()
        p.line(`public enum ${name} {`)
        p.block(() => {
            for (const member of members) {
                p.line(
                    `@com.google.gson.annotations.SerializedName("${member.serializedName}") ${member.formattedName},`
                )
            }
        })
        p.line('}')
    }

    getFileNameForType(tpe: string): string {
        return `${tpe}.${this.getFileType()}`
    }

    getFileType(): string {
        return 'java'
    }
}

export class JavaFormatter extends Formatter {
    public options: LanguageOptions = {
        typeNameSeparator: '_',
        typeAnnotations: 'before',
        voidType: 'Void',
        reserved: new Set([
            'class',
            'interface',
            'object',
            'package',
            'var',
            'default',
            'case',
            'switch',
            'native',
        ]),
        keywordOverrides: new Map([[TypescriptKeyword.Null, 'Void']]),
    }

    mapSyntax(key: string, value: string): string {
        return `java.util.Map<${key}, ${value}>`
    }

    listSyntax(value: string): string {
        return `java.util.List<${value}>`
    }

    override formatFieldName(name: string): string {
        const escaped = name.replace(':', '_').replace('/', '_')
        const isKeyword = this.options.reserved.has(escaped)
        if (isKeyword) {
            return escaped + '_'
        }
        return escaped.replace(/[^a-zA-Z0-9]/g, '_')
    }
}
