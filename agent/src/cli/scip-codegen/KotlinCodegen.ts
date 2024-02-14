import fspromises from 'fs/promises'
import { scip } from './scip'
import { CodePrinter } from './CodePrinter'
import path from 'path'
import type { SymbolTable } from './SymbolTable'
import { typescriptKeyword, typescriptKeywordSyntax } from './utils'
import { KotlinFormatter } from './KotlinFormatter'
import { isNullOrUndefinedOrUnknownType } from './isNullOrUndefinedOrUnknownType'
import type * as pb_1 from 'google-protobuf'
import type { CodegenOptions } from './command'
import type { ConsoleReporter } from './ConsoleReporter'
import { type Diagnostic, Severity } from './Diagnostic'
import dedent from 'dedent'

interface DocumentContext {
    f: KotlinFormatter
    p: CodePrinter
    symtab: SymbolTable
}

export class KotlinCodegen {
    private f: KotlinFormatter
    public queue: scip.SymbolInformation[] = []
    public generatedSymbols = new Set<string>()
    public siblingDiscriminatedUnionProperties = new Map<string, string[]>()

    constructor(
        private readonly options: CodegenOptions,
        private readonly symtab: SymbolTable,
        private readonly reporter: ConsoleReporter
    ) {
        this.f = new KotlinFormatter(this.symtab)
    }

    public async run(): Promise<void> {
        try {
            await fspromises.stat(this.options.output)
            await fspromises.rm(this.options.output, { recursive: true })
        } catch {
            // ignore
        }
        await fspromises.mkdir(this.options.output, { recursive: true })
        await this.writeNullAlias()
        // TODO: infer package version from package.json
        await this.writeProtocolInterface(
            'CodyAgentServer',
            'cody-ai src/jsonrpc/`agent-protocol.ts`/ClientRequests#',
            'cody-ai src/jsonrpc/`agent-protocol.ts`/ClientNotifications#'
        )
        await this.writeProtocolInterface(
            'CodyAgentClient',
            'cody-ai src/jsonrpc/`agent-protocol.ts`/ServerRequests#',
            'cody-ai src/jsonrpc/`agent-protocol.ts`/ServerNotifications#'
        )
        let info = this.queue.pop()
        while (info !== undefined) {
            if (!this.generatedSymbols.has(info.symbol)) {
                this.writeType(info)
                this.generatedSymbols.add(info.symbol)
            }
            info = this.queue.pop()
        }

        await fspromises.mkdir(this.options.output, { recursive: true })
    }

    // Intentionally not private to prevent "unused method" warnings.
    public debug(msg: pb_1.Message, params?: { verbose: boolean }): string {
        if (params?.verbose) {
            return JSON.stringify(
                {
                    message: msg.toObject(),
                    debug: this.symtab.debuggingInfo.map(({ line, info }) => ({
                        line,
                        info: info.toObject(),
                    })),
                },
                null,
                2
            )
        }
        return JSON.stringify(msg.toObject(), null, 2)
    }

    private context(): DocumentContext & {
        c: DocumentContext
    } {
        const context: DocumentContext = { f: this.f, p: new CodePrinter(), symtab: this.symtab }
        return { ...context, c: context }
    }

    private async writeNullAlias(): Promise<void> {
        const { p } = this.context()
        p.line(`package ${this.options.kotlinPackage}`)
        p.line()
        p.line('typealias Null = Void?')
        await fspromises.writeFile(path.join(this.options.output, 'Null.kt'), p.build())
    }

    private async writeDataClass(
        { p, f, symtab }: DocumentContext,
        name: string,
        info: scip.SymbolInformation
    ): Promise<void> {
        if (info.kind === scip.SymbolInformation.Kind.Class) {
            this.reporter.warn(
                info.symbol,
                `classes should not be exposed in the agent protocol because they don't serialize to JSON.`
            )
        }
        p.line(`data class ${name}(`)
        p.block(() => {
            for (const memberSymbol of info.signature.class_signature.declarations.symlinks) {
                if (
                    this.f.ignoredProperties.find(ignoredProperty =>
                        memberSymbol.endsWith(ignoredProperty)
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
                if (
                    memberType.has_type_ref &&
                    memberType.type_ref.symbol.endsWith(' lib/`lib.es5.d.ts`/Omit#')
                ) {
                    // FIXME
                    continue
                }
                this.queueClassLikeType(memberType, member, 'parameter')
                const memberTypeSyntax = f.jsonrpcTypeName(member, memberType, 'parameter')
                const constants = this.stringConstantsFromInfo(member)
                const oneofSyntax = constants.length > 0 ? ' // Oneof: ' + constants.join(', ') : ''
                p.line(`var ${member.display_name}: ${memberTypeSyntax}? = null,${oneofSyntax}`)
            }
        })
        p.line(')')
    }

    private aliasType(info: scip.SymbolInformation): string | undefined {
        if (info.display_name === 'Date') {
            // HACK: we should not be using `Date` in our protocol because it doesn't have serializate properly
            return 'Double'
        }

        if (this.isStringTypeInfo(info)) {
            const constants = this.stringConstantsFromInfo(info)
            return `String // One of: ${constants.join(', ')}`
        }

        return undefined
    }

    private async writeType(info: scip.SymbolInformation): Promise<void> {
        const { f, p, c } = this.context()
        const name = f.typeName(info)
        p.line('@file:Suppress("FunctionName", "ClassName")')
        p.line(`package ${this.options.kotlinPackage}`)
        p.line()
        const alias = this.aliasType(info)
        if (alias) {
            p.line(`typealias ${name} = ${alias}`)
        } else {
            this.writeDataClass(c, name, info)
        }
        p.line()
        await fspromises.writeFile(path.join(this.options.output, `${name}.kt`), p.build())
    }

    private async writeProtocolInterface(
        name: string,
        requests: string,
        notifications: string
    ): Promise<void> {
        const { f, p, symtab } = this.context()
        p.line('@file:Suppress("FunctionName", "ClassName")')
        p.line(`package ${this.options.kotlinPackage}`)
        p.line()
        p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonNotification')
        p.line('import org.eclipse.lsp4j.jsonrpc.services.JsonRequest')
        p.line('import java.util.concurrent.CompletableFuture')
        p.line()
        p.line('@Suppress("unused")')
        p.line(`interface ${name} {`)

        p.block(() => {
            p.sectionComment('Requests')
            for (const request of symtab.structuralType(symtab.canonicalSymbol(requests))) {
                // Process a JSON-RPC request signature. For example:
                // type Requests = { 'textDocument/inlineCompletions': [RequestParams, RequestResult] }
                let resultType = request.signature.value_signature.tpe.type_ref.type_arguments[1]

                // TODO: make nullable handling generic for any type, not just request parameters
                let nullableSyntax = ''
                if (
                    resultType.has_union_type &&
                    resultType.union_type.types.length === 2 &&
                    resultType.union_type.types[1].type_ref.symbol === typescriptKeyword('null')
                ) {
                    nullableSyntax = '?'
                    resultType = resultType.union_type.types[0]
                }

                const { parameterType, parameterSyntax } = f.jsonrpcMethodParameter(request)
                this.queueClassLikeType(parameterType, request, 'parameter')
                this.queueClassLikeType(resultType, request, 'result')
                const resultTypeSyntax = f.jsonrpcTypeName(request, resultType, 'result')

                p.line(`@JsonRequest("${request.display_name}")`)
                p.line(
                    `fun ${f.functionName(request)}(${parameterSyntax}): ` +
                        `CompletableFuture<${resultTypeSyntax}${nullableSyntax}>`
                )
            }

            p.line()
            p.sectionComment('Notifications')
            for (const notification of symtab.structuralType(symtab.canonicalSymbol(notifications))) {
                // Process a JSON-RPC request signature. For example:
                // type Notifications = { 'textDocument/inlineCompletions': [NotificationParams] }
                const { parameterType, parameterSyntax } = f.jsonrpcMethodParameter(notification)
                this.queueClassLikeType(parameterType, notification, 'parameter')
                p.line(`@JsonNotification("${notification.display_name}")`)
                p.line(`fun ${f.functionName(notification)}(${parameterSyntax})`)
            }
        })

        p.line('}')

        await fspromises.writeFile(path.join(this.options.output, `${name}.kt`), p.build())
    }

    private isStringType(type: scip.Type): boolean {
        if (type.has_constant_type) {
            return type.constant_type.constant.has_string_constant
        }

        if (type.has_union_type) {
            return type.union_type.types.every(type => this.isStringType(type))
        }

        if (type.has_intersection_type) {
            return Boolean(
                type.intersection_type.types.find(
                    type => type.has_type_ref && type.type_ref.symbol === typescriptKeyword('string')
                )
            )
        }

        if (type.has_type_ref) {
            return (
                type.type_ref.symbol === typescriptKeyword('string') ||
                this.isStringTypeInfo(this.symtab.info(type.type_ref.symbol))
            )
        }

        return false
    }

    private isStringTypeInfo(info: scip.SymbolInformation): boolean {
        if (info.signature.has_value_signature) {
            return this.isStringType(info.signature.value_signature.tpe)
        }

        if (
            info.signature.has_type_signature &&
            info.signature.type_signature.type_parameters &&
            info.signature.type_signature.type_parameters.symlinks.length === 0
        ) {
            return this.isStringType(info.signature.type_signature.lower_bound)
        }

        if (info.signature.has_class_signature && info.kind === scip.SymbolInformation.Kind.Enum) {
            return info.signature.class_signature.declarations.symlinks.every(member =>
                this.isStringTypeInfo(this.symtab.info(member))
            )
        }

        return false
    }

    public compatibleSignatures(a: scip.SymbolInformation, b: scip.SymbolInformation): boolean {
        if (this.isStringTypeInfo(a) && this.isStringTypeInfo(b)) {
            return true
        }
        // TODO: more optimized comparison?
        return JSON.stringify(a.signature.toObject()) === JSON.stringify(b.signature.toObject())
    }

    private infoProperties(info: scip.SymbolInformation): string[] {
        if (info.signature.has_class_signature) {
            const result: string[] = []
            result.push(...info.signature.class_signature.declarations.symlinks)
            for (const parent of info.signature.class_signature.parents) {
                result.push(...this.properties(parent))
            }
            return result
        }

        if (info.signature.has_type_signature) {
            return this.properties(info.signature.type_signature.lower_bound)
        }

        this.reporter.error(info.symbol, `info has no properties: ${this.debug(info)}`)
        return []
    }

    private stringConstantsFromType(type: scip.Type): string[] {
        return this.stringConstantsFromInfo(
            new scip.SymbolInformation({
                signature: new scip.Signature({
                    value_signature: new scip.ValueSignature({ tpe: type }),
                }),
            })
        )
    }
    private stringConstantsFromInfo(info: scip.SymbolInformation): string[] {
        const result: string[] = []
        const isVisited = new Set<string>()
        const visitInfo = (info: scip.SymbolInformation) => {
            if (isVisited.has(info.symbol)) {
                return
            }
            isVisited.add(info.symbol)
            for (const sibling of this.siblingDiscriminatedUnionProperties.get(info.symbol) ?? []) {
                visitInfo(this.symtab.info(sibling))
            }
            if (info.signature.has_value_signature) {
                visitType(info.signature.value_signature.tpe)
                return
            }
            if (info.signature.has_type_signature) {
                visitType(info.signature.type_signature.lower_bound)
                return
            }
            if (info.signature.has_class_signature && info.kind === scip.SymbolInformation.Kind.Enum) {
                for (const member of info.signature.class_signature.declarations.symlinks) {
                    visitInfo(this.symtab.info(member))
                }
                return
            }
            return info.symbol === typescriptKeyword('string')
        }
        const visitType = (type: scip.Type) => {
            if (type.has_constant_type && type.constant_type.constant.has_string_constant) {
                result.push(type.constant_type.constant.string_constant.value)
            }
            if (type.has_union_type) {
                for (const constant of type.union_type.types) {
                    visitType(constant)
                }
            }
            if (type.has_type_ref) {
                visitInfo(this.symtab.info(type.type_ref.symbol))
            }
        }
        visitInfo(info)
        return result
    }

    private pickProperties(type: scip.Type): string[] {
        const [t, k] = type.type_ref.type_arguments
        const constants = new Set<string>(this.stringConstantsFromType(k))
        return this.properties(t).filter(property =>
            constants.has(this.symtab.info(property).display_name)
        )
    }

    private omitProperties(type: scip.Type): string[] {
        const [t, k] = type.type_ref.type_arguments
        const constants = new Set<string>(this.stringConstantsFromType(k))
        return this.properties(t).filter(
            property => !constants.has(this.symtab.info(property).display_name)
        )
    }

    private properties(type: scip.Type): string[] {
        if (type.has_structural_type) {
            return type.structural_type.declarations.symlinks
        }

        if (type.has_intersection_type) {
            return type.intersection_type.types.flatMap(intersectionType =>
                this.properties(intersectionType)
            )
        }

        if (type.has_union_type) {
            return type.union_type.types.flatMap(unionType => this.properties(unionType))
        }

        if (type.has_type_ref) {
            if (type.type_ref.symbol.endsWith(' lib/`lib.es5.d.ts`/Pick#')) {
                return this.pickProperties(type)
            }
            if (type.type_ref.symbol.endsWith(' lib/`lib.es5.d.ts`/Omit#')) {
                return this.omitProperties(type)
            }
            return this.infoProperties(this.symtab.info(type.type_ref.symbol))
        }

        // NOTE: we must not return [] for non-class-like types such as string
        // literals. If you're hitting on this error with types like string
        // literals it means you are not guarding against it higher up in the
        // call stack.
        // throw new TypeError(`type has no properties: ${this.debug(type)}`)
        this.reporter.error('', `type has no properties: ${this.debug(type)}`)
        return []
    }

    public isEmptySignature(signature: scip.Signature): boolean {
        if (
            signature.has_value_signature &&
            Object.keys(signature.value_signature.tpe.toObject()).length === 0
        ) {
            return true
        }
        return false
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
            } else if (typescriptKeywordSyntax(type.type_ref.symbol)) {
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
                            declarations: new scip.Scope({ symlinks: this.properties(type) }),
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
            const nonNullTypes = type.union_type.types.filter(
                type => !isNullOrUndefinedOrUnknownType(type)
            )
            if (nonNullTypes.length === 1) {
                // Ignore `| null` union types and just queue the non-null type.
                // All properties in the generated bindings are nullable by
                // defaults anyways, even if the original type is not nullable.
                this.queueClassLikeType(nonNullTypes[0], jsonrpcMethod, kind)
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
                    this.queueClassLikeType(nonNullTypes[exceptionIndex], jsonrpcMethod, kind)
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

    // Same as `queueClassLikeType` but for `scip.SymbolInformation` instead of `scip.Type`.
    private queueClassLikeInfo(jsonrpcMethod: scip.SymbolInformation): void {
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
                { info: scip.SymbolInformation; diagnostic: Diagnostic; siblings: string[] }
            >()
            for (const property of this.properties(jsonrpcMethod.signature.type_signature.lower_bound)) {
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
            }
            return
        }

        throw new TypeError(`unknown info: ${JSON.stringify(jsonrpcMethod.toObject(), null, 2)}`)
    }
}
