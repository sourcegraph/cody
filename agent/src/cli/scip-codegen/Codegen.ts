import fspromises from 'node:fs/promises'
import path from 'node:path'
import dedent from 'dedent'
import { BaseCodegen, type DiscriminatedUnion, type DiscriminatedUnionMember } from './BaseCodegen'

import { CodePrinter } from '../../../../vscode/src/completions/context/retrievers/tsc/CodePrinter'
import type { ConsoleReporter } from './ConsoleReporter'
import { type Diagnostic, Severity } from './Diagnostic'
import { Formatter } from './Formatter'
import type { SymbolTable } from './SymbolTable'
import type { CodegenOptions } from './command'
import { resetOutputPath } from './resetOutputPath'
import { scip } from './scip'
import { stringLiteralType } from './stringLiteralType'
import { capitalize, isTypescriptKeyword, typescriptKeyword, typescriptKeywordSyntax } from './utils'

interface DocumentContext {
    f: Formatter
    p: CodePrinter
    symtab: SymbolTable
}

export enum TargetLanguage {
    Java = 'java',
    Kotlin = 'kotlin',
    CSharp = 'csharp',
}

export class Codegen extends BaseCodegen {
    private f: Formatter
    public queue: scip.SymbolInformation[] = []
    public generatedSymbols = new Set<string>()
    public stringLiteralConstants = new Set<string>()

    constructor(
        private language: TargetLanguage,
        options: CodegenOptions,
        symtab: SymbolTable,
        reporter: ConsoleReporter
    ) {
        super(options, symtab, reporter)
        this.f = new Formatter(this.language, this.symtab, this)
    }

    public async run(): Promise<void> {
        await resetOutputPath(this.options.output)
        await this.writeNullAlias()
        await this.writeProtocolInterface(
            'CodyAgentServer',
            BaseCodegen.protocolSymbols.client.requests,
            BaseCodegen.protocolSymbols.client.notifications
        )
        await this.writeProtocolInterface(
            'CodyAgentClient',
            BaseCodegen.protocolSymbols.server.requests,
            BaseCodegen.protocolSymbols.server.notifications
        )
        let info = this.queue.pop()
        while (info !== undefined) {
            if (!this.generatedSymbols.has(info.symbol)) {
                this.writeType(info)
                this.generatedSymbols.add(info.symbol)
            }
            info = this.queue.pop()
        }

        await this.writeSerializationAdapters()
        await this.writeStringLiteralConstants()

        await fspromises.mkdir(this.options.output, { recursive: true })
    }

    private startDocument(): DocumentContext & {
        c: DocumentContext
    } {
        const context: DocumentContext = {
            f: this.f,
            p: new CodePrinter(),
            symtab: this.symtab,
        }
        return { ...context, c: context }
    }

    private async writeSerializationAdapters(): Promise<void> {
        if (this.discriminatedUnions.size === 0) {
            return
        }
        const { p } = this.startDocument()
        switch (this.language) {
            case TargetLanguage.Kotlin:
                p.line('@file:Suppress("unused", "ConstPropertyName")')
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('object ProtocolTypeAdapters {')
                break
            case TargetLanguage.Java:
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('public final class ProtocolTypeAdapters {')
                break
            case TargetLanguage.CSharp:
                p.line(`namespace ${this.options.kotlinPackage};`)
                p.line('{')
                p.block(() => {
                    p.line('public static class ProtocolTypeAdapters')
                    p.line('{')
                })
                break
        }
        p.block(() => {
            switch (this.language) {
                case TargetLanguage.Kotlin:
                    p.line('fun register(gson: com.google.gson.GsonBuilder) {')
                    break
                case TargetLanguage.Java:
                    p.line('public static void register(com.google.gson.GsonBuilder gson) {')
                    break
                case TargetLanguage.CSharp:
                    p.line('public static void Register(JsonSerializerOptions options)')
                    p.line('{')
                    break
            }
            p.block(() => {
                const discriminatedUnions = [...this.discriminatedUnions.keys()].sort()
                for (const symbol of discriminatedUnions) {
                    const name = this.symtab.info(symbol).display_name
                    switch (this.language) {
                        case TargetLanguage.Kotlin:
                            p.line(`gson.registerTypeAdapter(${name}::class.java, ${name}.deserializer)`)
                            break
                        case TargetLanguage.Java:
                            p.line(`gson.registerTypeAdapter(${name}.class, ${name}.deserializer());`)
                            break
                        case TargetLanguage.CSharp:
                            p.line(`options.Converters.Add(new ${name}Converter());`)
                            break
                    }
                }
            })
            p.line('}')
        })
        p.line('}')
        await fspromises.writeFile(
            path.join(this.options.output, `ProtocolTypeAdapters.${this.fileExtension()}`),
            p.build()
        )
    }

    private async writeStringLiteralConstants(): Promise<void> {
        if (this.stringLiteralConstants.size === 0) {
            return
        }
        const { p } = this.startDocument()
        switch (this.language) {
            case TargetLanguage.CSharp:
                p.line(`namespace ${this.options.kotlinPackage};`)
                p.line('{')
                p.line('public static class Constants')
                p.line('{')
                break
            case TargetLanguage.Kotlin:
                p.line('@file:Suppress("unused", "ConstPropertyName")')
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('object Constants {')
                break
            case TargetLanguage.Java:
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('public final class Constants {')
                break
        }
        p.block(() => {
            const constants = [...this.stringLiteralConstants.values()].sort()
            for (const constant of constants) {
                switch (this.language) {
                    case TargetLanguage.Kotlin:
                        p.line(`const val ${this.f.formatFieldName(constant)} = "${constant}"`)
                        break
                    case TargetLanguage.Java:
                        p.line(
                            `public static final String ${this.f.formatFieldName(
                                constant
                            )} = "${constant}";`
                        )
                        break
                    case TargetLanguage.CSharp:
                        p.line(
                            `public const string ${this.f.formatFieldName(constant)} = "${constant}";`
                        )
                        break
                }
            }
        })
        p.line('}')
        if (this.language === TargetLanguage.CSharp) {
            p.line('}')
        }
        await fspromises.writeFile(
            path.join(this.options.output, `Constants.${this.fileExtension()}`),
            p.build()
        )
    }

    private fileExtension() {
        switch (this.language) {
            case TargetLanguage.CSharp:
                return 'cs'
            case TargetLanguage.Kotlin:
                return 'kt'
            default:
                return 'java'
        }
    }

    private async writeNullAlias(): Promise<void> {
        const { p } = this.startDocument()
        switch (this.language) {
            case TargetLanguage.Kotlin:
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('typealias Null = Void?')
                break
            case TargetLanguage.Java:
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('public final class Null {}')
                break
            case TargetLanguage.CSharp:
                p.line(`namespace ${this.options.kotlinPackage};`)
                p.line('{')
                p.block(() => {
                    p.line('public sealed class Null {}')
                })
                p.line('}')
                break
        }
        await fspromises.writeFile(
            path.join(this.options.output, `Null.${this.fileExtension()}`),
            p.build()
        )
    }

    private async writeSealedClass(
        { p, f, symtab }: DocumentContext,
        name: string,
        info: scip.SymbolInformation,
        union: DiscriminatedUnion
    ): Promise<void> {
        if (this.language === TargetLanguage.CSharp) {
            p.addImport('using Newtonsoft.Json;')
        } else {
            p.line('import com.google.gson.Gson;')
            p.line('import com.google.gson.JsonDeserializationContext;')
            p.line('import com.google.gson.JsonDeserializer;')
            p.line('import com.google.gson.JsonElement;')
            p.line('import java.lang.reflect.Type;')
        }
        p.line()
        switch (this.language) {
            case TargetLanguage.Kotlin:
                p.line(`sealed class ${name} {`)
                break
            case TargetLanguage.Java:
                p.line(`public abstract class ${name} {`)
                break
            case TargetLanguage.CSharp:
                p.line(`[JsonConverter(typeof(${name}Converter))]`)
                name = name
                    .split(/[ -]/)
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                    .join('')
                p.line(`public abstract class ${name}`)
                p.line('{')
                break
        }
        p.block(() => {
            if (this.language === TargetLanguage.Kotlin) {
                p.line('companion object {')
            }
            p.block(() => {
                switch (this.language) {
                    case TargetLanguage.Kotlin:
                        p.line(`val deserializer: JsonDeserializer<${name}> =`)
                        break
                    case TargetLanguage.Java:
                        p.line(`public static JsonDeserializer<${name}> deserializer() {`)
                        break
                    case TargetLanguage.CSharp:
                        p.line(`private class ${name}Converter : JsonConverter<${name}>`)
                        p.line('{')
                        p.block(() => {
                            p.line(
                                `public override ${name} Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)`
                            )
                            p.line('{')
                            p.block(() => {
                                p.line('var jsonDoc = JsonDocument.ParseValue(ref reader);')
                                p.line(
                                    `var discriminator = jsonDoc.RootElement.GetProperty("${union.discriminatorDisplayName}").GetString();`
                                )
                                p.line('switch (discriminator)')
                                p.line('{')
                            })
                        })
                        break
                }
                p.block(() => {
                    switch (this.language) {
                        case TargetLanguage.Kotlin:
                            p.line(
                                'JsonDeserializer { element: JsonElement, _: Type, context: JsonDeserializationContext ->'
                            )
                            break
                        case TargetLanguage.Java:
                            p.line('return (element, _type, context) -> {')
                            break
                    }
                    p.block(() => {
                        const keyword = this.language === TargetLanguage.Kotlin ? 'when' : 'switch'
                        if (this.language !== TargetLanguage.CSharp) {
                            p.line(
                                `${keyword} (element.getAsJsonObject().get("${union.discriminatorDisplayName}").getAsString()) {`
                            )
                        }
                        p.block(() => {
                            const isHandledCase = new Set<string>()
                            for (const member of union.members) {
                                if (isHandledCase.has(member.value)) {
                                    // There's a bug in ContextProvider where
                                    // two cases have the same discriminator
                                    // 'search'
                                    this.reporter.warn(
                                        info.symbol,
                                        `duplicate discriminator value ${member.value}`
                                    )
                                    continue
                                }
                                isHandledCase.add(member.value)
                                const typeName = this.f.discriminatedUnionTypeName(union, member)
                                switch (this.language) {
                                    case TargetLanguage.Kotlin:
                                        p.line(
                                            `"${member.value}" -> context.deserialize<${typeName}>(element, ${typeName}::class.java)`
                                        )
                                        break
                                    case TargetLanguage.Java:
                                        p.line(
                                            `case "${member.value}": return context.deserialize(element, ${typeName}.class);`
                                        )
                                        break
                                    case TargetLanguage.CSharp:
                                        p.line(`case "${member.value}":`)
                                        p.block(() => {
                                            p.line(
                                                `return JsonSerializer.Deserialize<${typeName}>(jsonDoc.RootElement.GetRawText(), options);`
                                            )
                                        })
                                        break
                                }
                            }
                            switch (this.language) {
                                case TargetLanguage.Kotlin:
                                    p.line('else -> throw Exception("Unknown discriminator ${element}")')
                                    break
                                case TargetLanguage.Java:
                                    p.line(
                                        'default: throw new RuntimeException("Unknown discriminator " + element);'
                                    )
                                    break
                                case TargetLanguage.CSharp:
                                    p.line('default:')
                                    p.block(() => {
                                        p.line(
                                            'throw new JsonException($"Unknown discriminator {discriminator}");'
                                        )
                                    })
                                    p.line('}')
                                    break
                            }
                        })
                        p.line('}')
                    })
                    switch (this.language) {
                        case TargetLanguage.CSharp:
                            p.line(
                                'public override void Write(Utf8JsonWriter writer, ${name} value, JsonSerializerOptions options)'
                            )
                            p.line('{')
                            p.block(() => {
                                p.line(
                                    'JsonSerializer.Serialize(writer, value, value.GetType(), options);'
                                )
                            })
                            break
                        case TargetLanguage.Java:
                            p.line('};')
                            break
                        default:
                            p.line('}')
                    }
                })
            })
            p.line('}')
        })
        if (this.language === TargetLanguage.Kotlin || this.language === TargetLanguage.CSharp) {
            p.line('}')
        }
        for (const member of union.members) {
            p.line()
            const typeName = this.f.discriminatedUnionTypeName(union, member)
            const info = member.type.has_type_ref
                ? this.symtab.info(member.type.type_ref.symbol)
                : new scip.SymbolInformation({
                      display_name: typeName,
                      signature: new scip.Signature({
                          value_signature: new scip.ValueSignature({
                              tpe: member.type,
                          }),
                      }),
                  })
            this.writeDataClass({ p, f, symtab }, typeName, info, {
                innerClass: true,
                heritageClause:
                    this.language === TargetLanguage.Kotlin
                        ? ` : ${name}()`
                        : this.language === TargetLanguage.Java
                          ? ` extends ${name}`
                          : ` : ${name}`,
            })
        }
        if (this.language === TargetLanguage.Java || this.language === TargetLanguage.CSharp) {
            p.line('}')
        }
    }

    private async writeDataClass(
        { p, f, symtab }: DocumentContext,
        name: string,
        info: scip.SymbolInformation,
        params?: { heritageClause?: string; innerClass?: boolean }
    ): Promise<void> {
        try {
            await this.writeDataClassUnsafe({ p, f, symtab }, name, info, params)
        } catch (e) {
            const errorMessage = `Failed to handle class ${info.symbol}. To fix this problem, consider skipping this type by adding the symbol to "ignoredInfoSymbol" in Formatter.ts\n${e}`
            this.reporter.error(info.symbol, errorMessage)
        }
    }

    private async writeDataClassUnsafe(
        { p, f, symtab }: DocumentContext,
        name: string,
        info: scip.SymbolInformation,
        params?: { heritageClause?: string; innerClass?: boolean }
    ): Promise<void> {
        if (info.kind === scip.SymbolInformation.Kind.Class) {
            this.reporter.warn(
                info.symbol,
                `classes should not be exposed in the agent protocol because they don't serialize to JSON.`
            )
        }
        const generatedName = new Set<string>()
        const enums: { name: string; members: string[] }[] = []
        switch (this.language) {
            case TargetLanguage.Kotlin:
                p.line(`data class ${name}(`)
                break
            case TargetLanguage.Java: {
                const staticModifier = params?.innerClass ? 'static ' : ''
                p.line(`public ${staticModifier}final class ${name}${params?.heritageClause ?? ''} {`)
                break
            }
            case TargetLanguage.CSharp:
                p.line(`public class ${name}${params?.heritageClause ?? ''}`)
                p.line('{')
                break
        }
        p.block(() => {
            let hasMembers = false
            for (const memberSymbol of this.infoProperties(info)) {
                if (
                    this.f.ignoredProperties.find(ignoredProperty =>
                        memberSymbol.includes(ignoredProperty)
                    )
                ) {
                    continue
                }
                if (memberSymbol.endsWith('().')) {
                    // Ignore method members because they should not leak into
                    // the protocol in the first place because functions don't
                    // have meaningful JSON serialization. The most common cause
                    // is that a class leaks into the protocol.
                    continue
                }
                const member = symtab.info(memberSymbol)

                if (generatedName.has(member.display_name)) {
                    continue
                }
                generatedName.add(member.display_name)

                if (!member.signature.has_value_signature) {
                    throw new TypeError(
                        `not a value signature: ${JSON.stringify(member.toObject(), null, 2)}`
                    )
                }
                if (member.signature.value_signature.tpe.has_lambda_type) {
                    this.reporter.warn(
                        memberSymbol,
                        `ignoring property '${member.display_name}' because it does not serialize correctly to JSON. ` +
                            `To fix this warning, don't expose this lambda type to the protocol`
                    )
                    // Ignore properties with signatures like
                    // `ChatButton.onClick: (action: string) => void`
                    continue
                }
                const memberType = member.signature.value_signature.tpe
                if (memberType === undefined) {
                    throw new TypeError(`no type: ${JSON.stringify(member.toObject(), null, 2)}`)
                }

                if (this.f.isIgnoredType(memberType)) {
                    continue
                }

                let memberTypeSyntax = f.jsonrpcTypeName(member, memberType, 'parameter')
                const constants = this.stringConstantsFromInfo(member)
                for (const constant of constants) {
                    // HACK: merge this duplicate code with the same logic in this file
                    this.stringLiteralConstants.add(constant)
                }

                if (constants.length > 0 && memberTypeSyntax.startsWith('String')) {
                    const enumTypeName = this.f.formatEnumType(member.display_name)
                    memberTypeSyntax = enumTypeName + this.f.nullableSyntax(memberType)
                    enums.push({ name: enumTypeName, members: constants })
                } else {
                    try {
                        this.queueClassLikeType(memberType, member, 'parameter')
                    } catch (error) {
                        const stack = error instanceof Error ? '\n' + error.stack : ''
                        const errorMessage = `error handling member: ${member.symbol}. To fix this problem, you may want to ignore it from code generation by adding the symbol name to the "ignoredProperties" in the Formatter.ts file.\n${error}${stack}`
                        this.reporter.error(memberSymbol, errorMessage)
                        continue
                    }
                }
                const oneofSyntax = constants.length > 0 ? ' // Oneof: ' + constants.join(', ') : ''
                const defaultValueSyntax = this.f.isNullable(memberType) ? ' = null' : ''
                const fieldName = this.f.formatFieldName(member.display_name)
                const serializedAnnotation =
                    fieldName === member.display_name
                        ? ''
                        : `@com.google.gson.annotations.SerializedName("${member.display_name}") `
                switch (this.language) {
                    case TargetLanguage.Kotlin:
                        p.line(
                            `val ${member.display_name}: ${memberTypeSyntax}${defaultValueSyntax},${oneofSyntax}`
                        )
                        break
                    case TargetLanguage.Java:
                        p.line(
                            `${serializedAnnotation}public ${memberTypeSyntax} ${this.f.formatFieldName(
                                member.display_name
                            )};${oneofSyntax}`
                        )
                        break
                    case TargetLanguage.CSharp:
                        p.line(`[JsonProperty(PropertyName = "${member.display_name}")]`)
                        if (oneofSyntax.includes('-')) {
                            p.line(
                                `public string ${this.f.formatFieldName(
                                    member.display_name
                                )} { get; set; }${oneofSyntax}`
                            )
                            enums.length = 0
                        } else {
                            p.line(
                                `public ${memberTypeSyntax} ${this.f.formatFieldName(
                                    member.display_name
                                )} { get; set; }${oneofSyntax}`
                            )
                        }
                        break
                }
                hasMembers = true
            }
            if (!hasMembers) {
                if (this.language === TargetLanguage.Kotlin) {
                    p.line('val placeholderField: String? = null // Empty data class')
                } else if (this.language === TargetLanguage.CSharp) {
                    p.line('public string PlaceholderField { get; set; } // Empty class')
                }
            }
        })
        if (enums.length === 0) {
            if (this.language === TargetLanguage.Kotlin) {
                p.line(`)${params?.heritageClause ?? ''}`)
            } else {
                p.line('}')
            }
            return
        }
        if (this.language === TargetLanguage.Kotlin) {
            p.line(`)${params?.heritageClause ?? ''} {`)
        }
        // Nest enum classe inside data class to avoid naming conflicts with
        // enums for other data classes in the same package.
        p.block(() => {
            if (this.language === TargetLanguage.Kotlin) {
                p.addImport('import com.google.gson.annotations.SerializedName;')
            } else if (this.language === TargetLanguage.CSharp) {
                p.addImport('using Newtonsoft.Json;')
            }

            for (const { name, members } of enums) {
                this.writeEnum(p, name, members)
            }
        })
        p.line('}')
    }

    private aliasType(info: scip.SymbolInformation): string | undefined {
        if (info.display_name === 'Date') {
            // Special case for built-in `Date` type because it doesn't
            // serialize to JSON objects with `JSON.stringify()` like it does
            // for other classes.
            return 'String'
        }

        if (this.isStringTypeInfo(info)) {
            const constants = this.stringConstantsFromInfo(info)
            for (const constant of constants) {
                this.stringLiteralConstants.add(constant)
            }
            return `String // One of: ${constants.join(', ')}`
        }

        return undefined
    }

    private writeEnum(p: CodePrinter, name: string, members: string[]): void {
        p.line()
        switch (this.language) {
            case TargetLanguage.Kotlin:
                p.line(`enum class ${name} {`)
                break
            case TargetLanguage.Java:
                p.line(`public enum ${name} {`)
                break
            case TargetLanguage.CSharp:
                p.line(`public enum ${name}`)
                p.line('{')
                break
        }
        p.block(() => {
            for (const member of members) {
                const serializedName = (() => {
                    switch (this.language) {
                        case TargetLanguage.CSharp:
                            return ''
                        case TargetLanguage.Kotlin:
                            return `@SerializedName("${member}")`
                        case TargetLanguage.Java:
                            return `@com.google.gson.annotations.SerializedName("${member}")`
                        default:
                            return ''
                    }
                })()
                const enumName = this.f.formatFieldName(capitalize(member))
                switch (this.language) {
                    case TargetLanguage.CSharp:
                        p.line(`${enumName}, // ${member}`)
                        break
                    default:
                        p.line(`${serializedName} ${enumName},`)
                        break
                }
            }
        })
        p.line('}')
    }

    private async writeType(info: scip.SymbolInformation): Promise<void> {
        const { f, p, c } = this.startDocument()
        const name = f.typeName(info)
        const alias = this.aliasType(info)
        if (this.f.isIgnoredInfo(info)) {
            return
        }

        if (this.language === TargetLanguage.CSharp) {
            p.addImport('using Newtonsoft.Json;')
            p.line()
            p.line(`namespace ${this.options.kotlinPackage}`)
            p.line('{')
            p.block(() => {
                if (alias) {
                    if (this.isStringTypeInfo(info)) {
                        const constants = this.stringConstantsFromInfo(info)
                        if (constants.length > 0) {
                            this.writeEnum(p, name, constants)
                        } else {
                            p.line(`public class ${name}`)
                            p.line('{')
                            p.block(() => {
                                p.line('public string Value { get; set; }')
                                p.line()
                                p.line(
                                    `public static implicit operator string(${name} value) => value.Value;`
                                )
                                p.line(
                                    `public static implicit operator ${name}(string value) => new ${name} { Value = value };`
                                )
                            })
                            p.line('}')
                        }
                    } else {
                        p.line(`public class ${name} : ${alias} { }`)
                    }
                } else if (info.signature.has_class_signature) {
                    this.writeDataClass(c, name, info)
                } else if (info.signature.has_type_signature) {
                    const discriminatedUnion = this.discriminatedUnions.get(info.symbol)
                    if (discriminatedUnion) {
                        this.writeSealedClass(c, name, info, discriminatedUnion)
                    } else if (this.isStringTypeInfo(info)) {
                        const constants = this.stringConstantsFromInfo(info)
                        if (constants.length > 0) {
                            this.writeEnum(p, name, constants)
                        } else {
                            p.line(`public class ${name} : String { }`)
                        }
                    } else {
                        this.writeDataClass(c, name, info)
                    }
                } else {
                    throw new Error(`Unsupported signature: ${JSON.stringify(info.toObject(), null, 2)}`)
                }
            })
            p.line('}')
            const filename = `${info.display_name}.${this.fileExtension()}`
                .split('_')
                .map(capitalize)
                .join('')
            fspromises.writeFile(path.join(this.options.output, filename), p.build())
            return
        }

        if (this.language === TargetLanguage.Kotlin) {
            p.line(
                '@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")'
            )
        }
        p.line(`package ${this.options.kotlinPackage};`)
        p.line()
        if (alias) {
            if (this.language === TargetLanguage.Kotlin) {
                p.line(`typealias ${name} = ${alias}`)
            } else {
                if (info.display_name === 'Date') {
                    p.line('public final class Date {}')
                } else if (info.display_name === 'Null') {
                    p.line('public final class Null {}')
                } else {
                    const constants = this.stringConstantsFromInfo(info)
                    if (constants.length === 0) {
                        this.reporter.warn(info.symbol, `no constants for ${info.display_name}`)
                        p.line(`public final class ${name} {} // TODO: fixme`)
                    } else {
                        this.writeEnum(p, name, constants)
                    }
                }
            }
        } else {
            const discriminatedUnion = this.discriminatedUnions.get(info.symbol)
            if (discriminatedUnion) {
                this.writeSealedClass(c, name, info, discriminatedUnion)
            } else {
                this.writeDataClass(c, name, info)
            }
        }
        p.line()
        await fspromises.writeFile(
            path.join(this.options.output, `${name}.${this.fileExtension()}`),
            p.build()
        )
    }

    private async writeProtocolInterface(
        name: string,
        requests: string,
        notifications: string
    ): Promise<void> {
        const { f, p, symtab } = this.startDocument()
        switch (this.language) {
            case TargetLanguage.Kotlin:
                p.line('@file:Suppress("FunctionName", "ClassName", "RedundantNullable")')
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;')
                p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;')
                p.line('import java.util.concurrent.CompletableFuture;')
                break
            case TargetLanguage.Java:
                p.line(`package ${this.options.kotlinPackage};`)
                p.line()
                p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;')
                p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;')
                p.line('import java.util.concurrent.CompletableFuture;')
                break
            case TargetLanguage.CSharp:
                p.addImport('using System.Threading.Tasks;')
                p.line()
                p.line(`namespace ${this.options.kotlinPackage};`)
                p.line('{')
                break
        }
        p.line()
        switch (this.language) {
            case TargetLanguage.Kotlin:
                p.line('@Suppress("unused")')
                p.line(`interface ${name} {`)
                break
            case TargetLanguage.Java:
                p.line('@SuppressWarnings("unused")')
                p.line(`public interface ${name} {`)
                break
            case TargetLanguage.CSharp:
                p.line('public interface ' + name)
                p.line('{')
                break
        }
        p.block(() => {
            p.sectionComment('Requests')
            for (const request of symtab.structuralType(symtab.canonicalSymbol(requests))) {
                // We skip the webview protocol because our IDE clients are now
                // using the string-encoded protocol instead.
                if (
                    request.display_name === 'webview/receiveMessage' ||
                    request.display_name === 'chat/submitMessage' ||
                    request.display_name === 'chat/editMessage'
                ) {
                    continue
                }
                // Process a JSON-RPC request signature. For example:
                // type Requests = { 'textDocument/inlineCompletions': [RequestParams, RequestResult] }
                const resultType = request.signature.value_signature.tpe.type_ref.type_arguments?.[1]
                if (resultType === undefined) {
                    this.reporter.error(
                        request.symbol,
                        `missing result type for request. To fix this problem, add a second element to the array type like this: 'example/method: [RequestParams, RequestResult]'`
                    )
                    continue
                }
                const { parameterType, parameterSyntax } = f.jsonrpcMethodParameter(request)
                this.queueClassLikeType(parameterType, request, 'parameter')
                this.queueClassLikeType(resultType, request, 'result')
                const resultTypeSyntax = f.jsonrpcTypeName(request, resultType, 'result')
                switch (this.language) {
                    case TargetLanguage.Kotlin:
                        p.line(`@JsonRequest("${request.display_name}")`)
                        p.line(
                            `fun ${f.functionName(request)}(${parameterSyntax}): ` +
                                `CompletableFuture<${resultTypeSyntax}>`
                        )
                        break
                    case TargetLanguage.Java:
                        p.line(`@JsonRequest("${request.display_name}")`)
                        p.line(
                            `CompletableFuture<${resultTypeSyntax}> ${f.functionName(
                                request
                            )}(${parameterSyntax});`
                        )
                        break
                    case TargetLanguage.CSharp: {
                        p.line(`[JsonRpcMethod("${request.display_name}")]`)
                        const _task = resultTypeSyntax === 'Void' ? 'Task' : `Task<${resultTypeSyntax}>`
                        const _params = parameterSyntax.startsWith('Void') ? '' : parameterSyntax
                        const _func = capitalize(f.functionName(request))
                        p.line(`${_task} ${_func}(${_params});`)
                        break
                    }
                }
            }
            p.line()
            p.sectionComment('Notifications')
            for (const notification of symtab.structuralType(symtab.canonicalSymbol(notifications))) {
                // We skip the webview protocol because our IDE clients are now
                // using the string-encoded protocol instead.
                if (notification.display_name === 'webview/postMessage') {
                    continue
                }
                // Process a JSON-RPC request signature. For example:
                // type Notifications = { 'textDocument/inlineCompletions': [NotificationParams] }
                const { parameterType, parameterSyntax } = f.jsonrpcMethodParameter(notification)
                this.queueClassLikeType(parameterType, notification, 'parameter')
                const notificationName = f.functionName(notification)
                switch (this.language) {
                    case TargetLanguage.Kotlin:
                        p.line(`@JsonNotification("${notification.display_name}")`)
                        p.line(`fun ${notificationName}(${parameterSyntax})`)
                        break
                    case TargetLanguage.Java:
                        p.line(`@JsonNotification("${notification.display_name}")`)
                        p.line(`void ${notificationName}(${parameterSyntax});`)
                        break
                    case TargetLanguage.CSharp:
                        p.line(`[JsonRpcMethod("${notification.display_name}")]`)
                        p.line(`void ${capitalize(notificationName)}(${parameterSyntax});`)
                        break
                }
            }
        })

        p.line('}')

        if (this.language === TargetLanguage.CSharp) {
            p.line('}')
        }

        await fspromises.writeFile(
            path.join(this.options.output, `${name}.${this.fileExtension()}`),
            p.build()
        )
    }

    // We are referencing the given type in the generated code. If this type
    // references a class-like symbol (example, TypeScript interface), then we
    // should queue the generation of this type.
    private queueClassLikeType(
        type: scip.Type,
        jsonrpcMethod: scip.SymbolInformation,
        kind: 'parameter' | 'result'
    ): void {
        if (type.has_type_ref) {
            if (type.type_ref.symbol === typescriptKeyword('array')) {
                this.queueClassLikeType(type.type_ref.type_arguments[0], jsonrpcMethod, kind)
            } else if (this.f.isRecord(type.type_ref.symbol)) {
                if (type.type_ref.type_arguments.length !== 2) {
                    throw new TypeError(`record must have 2 type arguments: ${this.debug(type)}`)
                }
                this.queueClassLikeType(type.type_ref.type_arguments[0], jsonrpcMethod, kind)
                this.queueClassLikeType(type.type_ref.type_arguments[1], jsonrpcMethod, kind)
            } else if (typescriptKeywordSyntax(this.language, type.type_ref.symbol)) {
                // Typescript keywords map to primitive types (Int, Double) or built-in types like String
            } else {
                this.queueClassLikeInfo(this.symtab.info(type.type_ref.symbol))
            }
            return
        }

        if (type.has_structural_type || type.has_intersection_type) {
            // Generate new (nominal) type for this anonymous
            // structural/intersection type. For example, consider the property
            // `foo` in `interface Foo { foo: A & B }` or `foo: { a: b, c: d}`,
            // we create a new type with the name `FooParams` that contains the
            // aggregate properties of `A & B` or `{a: b, c: d}`.
            this.queueClassLikeInfo(
                new scip.SymbolInformation({
                    display_name: this.f.jsonrpcTypeName(jsonrpcMethod, type, kind),
                    // Need unique symbol for parameter+result types
                    symbol: `${jsonrpcMethod.symbol}(${kind}).`,
                    signature: new scip.Signature({
                        // Convert structural types to class signature with name of the JSON-RPC method
                        class_signature: new scip.ClassSignature({
                            declarations: new scip.Scope({
                                symlinks: this.properties(type),
                            }),
                        }),
                    }),
                })
            )
            return
        }

        if (type.has_union_type && type.union_type.types.every(type => type.has_constant_type)) {
            // No need need to come up with a nominal type for unions of string
            // contants, like `foo: 'a' | 'b'`.
            return
        }

        if (type.has_union_type) {
            const nonNullableTypes = type.union_type.types.filter(type => !this.f.isNullable(type))
            if (
                nonNullableTypes.every(
                    tpe => tpe.has_type_ref && isTypescriptKeyword(this.language, tpe.type_ref.symbol)
                )
            ) {
                // Nothing to queue
                return
            }
            if (nonNullableTypes.length === 1) {
                // Ignore `| null` union types and just queue the non-null type.
                // All properties in the generated bindings are nullable by
                // defaults anyways, even if the original type is not nullable.
                this.queueClassLikeType(nonNullableTypes[0], jsonrpcMethod, kind)
            } else {
                // Used hardcoded list of exceptions for how to resolve union
                // types. In some cases, we are exposing VS Code  APIs that have
                // unions like `string | MarkdownString` where we just assume
                // the type will always be `string`.
                const exceptionIndex = this.f.unionTypeExceptionIndex.find(({ prefix }) =>
                    jsonrpcMethod.symbol.startsWith(prefix)
                )?.index
                if (exceptionIndex !== undefined) {
                    this.reporter.warn(
                        jsonrpcMethod.symbol,
                        `resolving unsupported union by picking type ${exceptionIndex}. ${this.debug(
                            jsonrpcMethod
                        )}`
                    )
                    this.queueClassLikeType(nonNullableTypes[exceptionIndex], jsonrpcMethod, kind)
                } else {
                    throw new Error(
                        `unsupported union type: ${JSON.stringify(jsonrpcMethod.toObject(), null, 2)}`
                    )
                }
            }
            return
        }

        if (type.has_constant_type) {
            return
        }

        throw new Error(`unsupported type: ${this.debug(type)}`)
    }

    private unionTypes(type: scip.Type): scip.Type[] {
        const result: scip.Type[] = []
        const loop = (t: scip.Type): void => {
            if (t.has_union_type) {
                for (const unionType of t.union_type.types) {
                    if (unionType.has_type_ref) {
                        const info = this.symtab.info(unionType.type_ref.symbol)
                        if (
                            info.signature.has_type_signature &&
                            info.signature.type_signature.lower_bound.has_union_type
                        ) {
                            loop(info.signature.type_signature.lower_bound)
                            continue
                        }
                    }
                    result.push(unionType)
                }
            }
        }
        loop(type)
        return result
    }
    private discriminatedUnion(info: scip.SymbolInformation): DiscriminatedUnion | undefined {
        if (!info.signature.has_type_signature) {
            return undefined
        }
        const type = info.signature.type_signature.lower_bound
        if (!type.has_union_type || type.union_type.types.length === 0) {
            return undefined
        }
        const candidates = new Map<string, number>()
        const memberss = new Map<string, DiscriminatedUnionMember[]>()
        const unionTypes = this.unionTypes(type)
        for (const unionType of unionTypes) {
            for (const propertySymbol of this.properties(unionType)) {
                const property = this.symtab.info(propertySymbol)
                const stringLiteral = stringLiteralType(property.signature.value_signature.tpe)
                if (!stringLiteral) {
                    continue
                }
                const count = candidates.get(property.display_name) ?? 0
                candidates.set(property.display_name, count + 1)
                let members = memberss.get(property.display_name)
                if (!members) {
                    members = []
                    memberss.set(property.display_name, members)
                }
                members.push({ value: stringLiteral, type: unionType })
            }
        }
        for (const [candidate, count] of candidates.entries()) {
            if (count === unionTypes.length) {
                return {
                    symbol: info.symbol,
                    discriminatorDisplayName: candidate,
                    members: memberss.get(candidate) ?? [],
                }
            }
        }
        return undefined
    }

    // Same as `queueClassLikeType` but for `scip.SymbolInformation` instead of `scip.Type`.
    private queueClassLikeInfo(jsonrpcMethod: scip.SymbolInformation): void {
        if (!jsonrpcMethod.has_signature) {
            return
        }
        if (jsonrpcMethod.signature.has_class_signature) {
            // Easy, this looks like a class/interface.
            this.queue.push(jsonrpcMethod)
            return
        }

        if (this.isStringTypeInfo(jsonrpcMethod)) {
            // Easy, we can create a string type alias
            this.queue.push(jsonrpcMethod)
            return
        }

        const discriminatedUnion = this.isNestedDiscriminatedUnion
            ? this.discriminatedUnion(jsonrpcMethod)
            : undefined
        if (discriminatedUnion) {
            this.discriminatedUnions.set(jsonrpcMethod.symbol, discriminatedUnion)
            this.queue.push(jsonrpcMethod)
            return
        }

        if (jsonrpcMethod.signature.has_type_signature) {
            // Tricky case, creatively convert this type alias into a class signature. This is tricky because
            // a type alias can have all sorts of shapes. For example,
            //   type Foo1 = A & B
            //   type Foo2 = { kind: 'a' } | {kind: 'b'}
            //   type Foo3 = ({ kind: 'a' } & A) | ({kind: 'b'} & B)
            //  The logic below does a best-effort to convert any shape into a
            //  basic data class (aka. struct). Simplified, we collect all the transitive properties of the referenced
            // types and create a class with all those properties while ensuring that no two properties have the same
            // name but incompatible type signatures. For example, there's no straighforward translation for the
            // following case because `member` has the type `string | number`:
            //   type ExtensionMessage =
            //      { kind: 'a', member: string } |
            //      { kind: 'a', member: number }
            //  When encountering these cases, we report an error message.

            const declarations = new Map<
                string,
                {
                    info: scip.SymbolInformation
                    diagnostic: Diagnostic
                    siblings: string[]
                }
            >()
            for (const property of this.properties(jsonrpcMethod.signature.type_signature.lower_bound)) {
                if (!this.symtab.has(property)) {
                    console.log(this.debug(jsonrpcMethod))
                    console.log(new Error().stack)
                    continue
                }
                const propertyInfo = this.symtab.info(property)
                const sibling = declarations.get(propertyInfo.display_name)
                if (!sibling) {
                    declarations.set(propertyInfo.display_name, {
                        info: propertyInfo,
                        diagnostic: {
                            severity: Severity.Error,
                            symbol: property,
                            message: dedent`Incompatible signatures. For discriminated unions, each property name must map to a unique type.
                                   For example, it's not allowed to have a property named 'result', which is a string for one type in the
                                   discrimated union and a number for another type in the union. To fix this problem, give one of the
                                   following properties a unique name and try running the code generator again.`,
                            additionalInformation: [],
                        },
                        siblings: [],
                    })
                    continue
                }
                const { info: siblingProperty, diagnostic, siblings } = sibling

                if (!this.compatibleSignatures(siblingProperty, propertyInfo)) {
                    diagnostic.additionalInformation?.push({
                        severity: Severity.Error,
                        symbol: property,
                        message: 'conflict here',
                    })
                } else {
                    siblings.push(property)
                }
            }

            if (declarations.size > 0) {
                for (const { info, diagnostic, siblings } of declarations.values()) {
                    this.siblingDiscriminatedUnionProperties.set(info.symbol, siblings)
                    if (
                        diagnostic.additionalInformation &&
                        diagnostic.additionalInformation.length > 0
                    ) {
                        this.reporter.report(diagnostic)
                    }
                }

                this.queue.push(
                    new scip.SymbolInformation({
                        display_name: jsonrpcMethod.display_name,
                        symbol: jsonrpcMethod.symbol,
                        signature: new scip.Signature({
                            class_signature: new scip.ClassSignature({
                                declarations: new scip.Scope({
                                    symlinks: [...declarations.values()].map(({ info }) => info.symbol),
                                }),
                            }),
                        }),
                    })
                )
            } else {
                this.reporter.warn(jsonrpcMethod.symbol, 'no properties found for this type')
            }
            return
        }

        throw new TypeError(`unknown info: ${JSON.stringify(jsonrpcMethod.toObject(), null, 2)}`)
    }
}
