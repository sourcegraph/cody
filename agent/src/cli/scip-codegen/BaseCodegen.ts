import type * as pb_1 from 'google-protobuf'
import type { ConsoleReporter } from './ConsoleReporter'
import type { SymbolTable } from './SymbolTable'
import type { CodegenOptions } from './command'
import { scip } from './scip'
import { typescriptKeyword } from './utils'

export enum ProtocolMethodDirection {
    ClientToServer = 1,
    ServerToClient = 2,
}

export enum ProtocolMethodKind {
    Notification = 1,
    Request = 2,
}

export interface ProtocolSymbol {
    symbol: string
    direction: ProtocolMethodDirection
    kind: ProtocolMethodKind
}

export interface DiscriminatedUnionMember {
    value: string
    type: scip.Type
}
export interface DiscriminatedUnion {
    symbol: string
    discriminatorDisplayName: string
    members: DiscriminatedUnionMember[]
}
export abstract class BaseCodegen {
    public readonly isNestedDiscriminatedUnion: boolean
    public discriminatedUnions = new Map<string, DiscriminatedUnion>()
    public siblingDiscriminatedUnionProperties = new Map<string, string[]>()
    public static protocolSymbols = {
        client: {
            requests: 'cody-ai src/jsonrpc/`agent-protocol.ts`/ClientRequests#',
            notifications: 'cody-ai src/jsonrpc/`agent-protocol.ts`/ClientNotifications#',
        },
        server: {
            requests: 'cody-ai src/jsonrpc/`agent-protocol.ts`/ServerRequests#',
            notifications: 'cody-ai src/jsonrpc/`agent-protocol.ts`/ServerNotifications#',
        },
    }
    public allProtocolSymbols(): ProtocolSymbol[] {
        return [
            {
                symbol: BaseCodegen.protocolSymbols.client.requests,
                direction: ProtocolMethodDirection.ClientToServer,
                kind: ProtocolMethodKind.Request,
            },
            {
                symbol: BaseCodegen.protocolSymbols.client.notifications,
                direction: ProtocolMethodDirection.ClientToServer,
                kind: ProtocolMethodKind.Notification,
            },
            {
                symbol: BaseCodegen.protocolSymbols.server.requests,
                direction: ProtocolMethodDirection.ServerToClient,
                kind: ProtocolMethodKind.Request,
            },
            {
                symbol: BaseCodegen.protocolSymbols.server.notifications,
                direction: ProtocolMethodDirection.ServerToClient,
                kind: ProtocolMethodKind.Notification,
            },
        ].map(symbol => ({ ...symbol, symbol: this.symtab.canonicalSymbol(symbol.symbol) }))
    }

    constructor(
        public readonly options: CodegenOptions,
        public readonly symtab: SymbolTable,
        public readonly reporter: ConsoleReporter
    ) {
        this.isNestedDiscriminatedUnion = options.discriminatedUnions === 'nested'
    }

    public abstract run(): Promise<void>

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

    protected isStringType(type: scip.Type): boolean {
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

    protected isStringTypeInfo(info: scip.SymbolInformation): boolean {
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

    protected infoProperties(info: scip.SymbolInformation): string[] {
        if (info.signature.has_class_signature) {
            const result: string[] = []
            for (const parent of info.signature.class_signature.parents) {
                result.push(...this.properties(parent))
            }
            result.push(...info.signature.class_signature.declarations.symlinks)
            return result
        }

        if (info.signature.has_type_signature) {
            return this.properties(info.signature.type_signature.lower_bound)
        }

        if (info.signature.has_value_signature) {
            return this.properties(info.signature.value_signature.tpe)
        }

        this.reporter.error(info.symbol, `info has no properties: ${this.debug(info)}`)
        return []
    }

    protected stringConstantsFromType(type: scip.Type): string[] {
        return this.stringConstantsFromInfo(
            new scip.SymbolInformation({
                signature: new scip.Signature({
                    value_signature: new scip.ValueSignature({ tpe: type }),
                }),
            })
        )
    }
    protected stringConstantsFromInfo(info: scip.SymbolInformation): string[] {
        const result = new Set<string>()
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
                result.add(type.constant_type.constant.string_constant.value)
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
        return [...result.values()]
    }

    protected pickProperties(type: scip.Type): string[] {
        const [t, k] = type.type_ref.type_arguments
        const constants = new Set<string>(this.stringConstantsFromType(k))
        return this.properties(t).filter(property =>
            constants.has(this.symtab.info(property).display_name)
        )
    }

    protected omitProperties(type: scip.Type): string[] {
        const [t, k] = type.type_ref.type_arguments
        const constants = new Set<string>(this.stringConstantsFromType(k))
        return this.properties(t).filter(
            property => !constants.has(this.symtab.info(property).display_name)
        )
    }

    protected properties(type: scip.Type): string[] {
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
}
