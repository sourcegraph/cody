import type { CodePrinter } from '../../../../../vscode/src/completions/context/retrievers/tsc/CodePrinter'
import type { DiscriminatedUnion } from '../BaseCodegen'
import type { Formatter } from '../Formatter'
import type { scip } from '../scip'

export interface Emitter {
    emitSerializationAdapter(p: CodePrinter, discriminatedUnions: string[]): void

    emitStringLiteralConstants(p: CodePrinter, stringLiterals: string[]): void

    emitNullAlias(p: CodePrinter): void

    emitProtocolInterface(p: CodePrinter, options: ProtocolInterface): void

    startType(p: CodePrinter, options: TypeOptions): void
    closeType(p: CodePrinter, options: TypeOptions): void
    emitTypeAlias(p: CodePrinter, options: TypeAliasOptions): void

    startSealedClass(p: CodePrinter, options: SealedClassOptions): void
    closeSealedClass?(p: CodePrinter, options: SealedClassOptions): void

    emitDataClass(p: CodePrinter, options: DataClassOptions): void

    emitEnum(p: CodePrinter, _enum: Enum): void

    getFileType(): string
    getFileNameForType(tpe: string): string

    formatter: Formatter
}

export interface ProtocolInterface {
    name: string
    requests: scip.SymbolInformation[]
    notifications: scip.SymbolInformation[]
}

export interface TypeAliasOptions {
    name: string
    alias: string
    isStringType: boolean
    info: scip.SymbolInformation
    enum?: Enum
}

export interface TypeOptions {
    name: string
    info: scip.SymbolInformation
    enum?: Enum
}

export interface SealedClassOptions {
    name: string
    info: scip.SymbolInformation
    union: DiscriminatedUnion
}

export interface DataClassOptions {
    name: string
    info: scip.SymbolInformation
    members: Member[]
    enums: Enum[]
    parentClass?: string
    innerClass?: boolean
    isStringType?: boolean
}

export interface Member {
    info: scip.SymbolInformation
    formattedName: string
    typeSyntax: string
    isNullable: boolean
    oneOfComment: string
}

export interface Enum {
    name: string
    members: EnumMember[]
}

export interface EnumMember {
    serializedName: string
    formattedName: string
}
