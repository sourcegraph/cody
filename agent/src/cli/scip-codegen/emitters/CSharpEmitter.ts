import type { CodePrinter } from '../../../../../vscode/src/completions/context/retrievers/tsc/CodePrinter'
import type { Codegen } from '../Codegen'
import { Formatter, type LanguageOptions } from '../Formatter'
import type { SymbolTable } from '../SymbolTable'
import type { CodegenOptions } from '../command'
import type { scip } from '../scip'
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

export class CSharpEmitter implements Emitter {
    formatter: CSharpFormatter

    constructor(
        private options: CodegenOptions,
        symtab: SymbolTable,
        codegen: Codegen
    ) {
        this.formatter = new CSharpFormatter(symtab, codegen)
    }

    emitSerializationAdapter(p: CodePrinter, discriminatedUnions: string[]): void {
        p.line(`namespace ${this.options.kotlinPackage};`)
        p.line('{')
        p.block(() => {
            p.line('public static class ProtocolTypeAdapters')
            p.line('{')
            p.block(() => {
                p.line('public static void Register(JsonSerializerOptions options)')
                p.line('{')
                for (const name of discriminatedUnions) {
                    p.line(`options.Converters.Add(new ${name}Converter());`)
                }
            })
            p.line('}')
        })
        p.line('}')
    }

    emitNullAlias(p: CodePrinter): void {
        p.line(`namespace ${this.options.kotlinPackage};`)
        p.line('{')
        p.block(() => {
            p.line('public sealed class Null {}')
        })
        p.line('}')
    }

    emitStringLiteralConstants(p: CodePrinter, stringLiterals: string[]): void {
        p.line(`namespace ${this.options.kotlinPackage};`)
        p.line('{')
        p.line('public static class Constants')
        p.line('{')
        p.block(() => {
            for (const literal of stringLiterals) {
                p.line(`public const string ${this.formatter.formatFieldName(literal)} = "${literal}";`)
            }
        })
        p.line('}')
        p.line('}')
    }

    emitProtocolInterface(p: CodePrinter, { name, requests, notifications }: ProtocolInterface): void {
        p.addImport('using System.Threading.Tasks;')
        p.line()
        p.line(`namespace ${this.options.kotlinPackage};`)
        p.line('{')
        p.line()
        p.line('public interface ' + name)
        p.line('{')

        p.block(() => {
            p.sectionComment('Requests')
            for (const request of requests) {
                const resultType = request.signature.value_signature.tpe.type_ref.type_arguments?.[1]
                const { parameterSyntax } = this.formatter.jsonrpcMethodParameter(request)
                const resultTypeSyntax = this.formatter.jsonrpcTypeName(request, resultType, 'result')
                p.line(`[JsonRpcMethod("${request.display_name}")]`)
                const _task = resultTypeSyntax === 'Void' ? 'Task' : `Task<${resultTypeSyntax}>`
                const _params = parameterSyntax.startsWith('Void') ? '' : parameterSyntax
                const _func = capitalize(this.formatter.functionName(request))
                p.line(`${_task} ${_func}(${_params});`)
            }

            p.line()
            p.sectionComment('Notifications')
            for (const notification of notifications) {
                const { parameterSyntax } = this.formatter.jsonrpcMethodParameter(notification)
                const notificationName = this.formatter.functionName(notification)
                p.line(`[JsonRpcMethod("${notification.display_name}")]`)
                p.line(`void ${capitalize(notificationName)}(${parameterSyntax});`)
            }
        })
        p.line('}')
        p.line('}')
    }

    startType(p: CodePrinter, _: TypeOptions): void {
        this.addJsonImport(p)
        p.line()
        p.line(`namespace ${this.options.kotlinPackage}`)
        p.line('{')
    }

    closeType(p: CodePrinter, _: TypeOptions): void {
        p.line('}')
    }

    emitTypeAlias(p: CodePrinter, { name, alias, isStringType, enum: enum_ }: TypeAliasOptions): void {
        p.block(() => {
            if (isStringType) {
                if (enum_) {
                    this.emitEnum(p, enum_)
                } else {
                    // Create an implicit string wrapper class
                    p.line(`public class ${name}`)
                    p.line('{')
                    p.block(() => {
                        p.line('public string Value { get; set; }')
                        p.line()
                        p.line(`public static implicit operator string(${name} value) => value.Value;`)
                        p.line(
                            `public static implicit operator ${name}(string value) => new ${name} { Value = value };`
                        )
                    })
                    p.line('}')
                }
            } else {
                // Create a class that inherits from the alias
                p.line(`public class ${name} : ${alias} {}`)
            }
        })
    }

    startSealedClass(p: CodePrinter, { name, union }: SealedClassOptions): void {
        this.addJsonImport(p)
        p.line()
        p.block(() => {
            p.line(`[JsonConverter(typeof(${name}Converter))]`)
            name = name.split(/[ -]/).map(capitalize).join('')
            p.line(`public abstract class ${name}`)
            p.line('{')
            p.block(() => {
                p.block(() => {
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
                            p.block(() => {
                                for (const member of union.members) {
                                    const typeName = this.formatter.discriminatedUnionTypeName(
                                        union,
                                        member
                                    )
                                    p.line(`case "${member.value}":`)
                                    p.block(() => {
                                        p.line(
                                            `return JsonSerializer.Deserialize<${typeName}>(jsonDoc.RootElement.GetRawText(), options);`
                                        )
                                    })
                                }
                                p.line('default:')
                                p.block(() => {
                                    p.line(
                                        'throw new JsonException($"Unknown discriminator {discriminator}");'
                                    )
                                })
                                p.line('}')
                            })
                        })
                        p.line('}')
                        p.line()

                        p.line(
                            `public override void Write(Utf8JsonWriter writer, ${name} value, JsonSerializerOptions options)`
                        )
                        p.line('{')
                        p.block(() =>
                            p.line('JsonSerializer.Serialize(writer, value, value.GetType(), options);')
                        )

                        p.line('}')
                    })
                    p.line('}')
                })
            })
        })
    }

    closeSealedClass(p: CodePrinter, _: SealedClassOptions): void {
        p.line('}')
    }

    emitDataClass(
        p: CodePrinter,
        { name, members, enums, parentClass, isStringType, innerClass }: DataClassOptions
    ): void {
        // Special case for string types
        if (isStringType) {
            for (const enum_ of enums) {
                this.emitEnum(p, enum_)
            }
            if (enums.length === 0) {
                p.line(`public class ${name} : string {}`)
            }
            return
        }
        if (innerClass) {
            p.line()
        }
        const heritage = parentClass ? ` : ${parentClass}` : ''
        p.block(() => {
            p.line(`public class ${name}${heritage}`)
            p.line('{')
            p.block(() => {
                for (const { info, typeSyntax, formattedName, oneOfComment } of members) {
                    p.line(`[JsonProperty(PropertyName = "${info.display_name}")]`)
                    if (oneOfComment.includes('-')) {
                        p.line(`public string ${formattedName} { get; set; }${oneOfComment}`)
                    } else {
                        p.line(`public ${typeSyntax} ${formattedName} { get; set; }${oneOfComment}`)
                    }
                }
                if (members.length === 0) {
                    p.line('public string PlaceholderField { get; set; } // Empty class')
                }
                if (enums.length > 0) {
                    this.addJsonImport(p)
                    for (const enum_ of enums) {
                        this.emitEnum(p, enum_)
                    }
                }
            })

            p.line('}')
        })
    }

    emitEnum(p: CodePrinter, { name, members }: Enum): void {
        p.line()
        p.line(`public enum ${name}`)
        p.line('{')
        p.block(() => {
            for (const { serializedName, formattedName } of members) {
                p.line(`[EnumMember(Value = "${serializedName}")]`)
                p.line(`${formattedName},`)
            }
        })
        p.line('}')
    }

    getFileType(): string {
        return 'cs'
    }

    getFileNameForType(tpe: string): string {
        return `${tpe}.${this.getFileType()}`.split('_').map(capitalize).join('')
    }

    private addJsonImport(p: CodePrinter): void {
        p.addImport('using System.Text.Json.Serialization;')
    }
}

export class CSharpFormatter extends Formatter {
    override options: LanguageOptions = {
        typeNameSeparator: '',
        typeAnnotations: 'before',
        voidType: 'Void',
        reserved: new Set(),
        keywordOverrides: new Map([
            [TypescriptKeyword.Null, 'Void'],
            [TypescriptKeyword.Boolean, 'bool'],
            [TypescriptKeyword.String, 'string'],
            [TypescriptKeyword.Long, 'int'],
        ]),
    }

    override functionName(info: scip.SymbolInformation): string {
        return info.display_name.replaceAll('$/', '').split('/').map(capitalize).join('')
    }

    override mapSyntax(key: string, value: string): string {
        return `Dictionary<${key}, ${value}>`
    }

    override listSyntax(value: string): string {
        return `${value}[]`
    }

    override formatFieldName(name: string): string {
        const escaped = name.replace(':', '_').replace('/', '_')
        return this.escape(escaped)
            .split('_')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('')
            .replaceAll('_', '')
    }
}
