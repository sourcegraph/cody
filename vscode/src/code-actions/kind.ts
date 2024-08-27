import type { CamelCase, CamelCasedProperties, OverrideProperties } from 'type-fest'
import * as vscode from 'vscode'

declare const CodyCodeActionTag: unique symbol
declare const InvalidString: unique symbol

export class CodyCodeActionKind

    //@ts-ignore: We extend & implement this way so that we inherit all the JSDocs whilst also being ablew to modify the function signatures.
    extends vscode.CodeActionKind
    implements
        OverrideProperties<
            vscode.CodeActionKind,
            {
                append: <S extends string>(parts: RequireActionPartsString<S>) => CodyCodeActionKind
            }
        >
{
    //@ts-ignore
    private readonly [CodyCodeActionTag]: unknown

    static readonly Empty = vscode.CodeActionKind.Empty.append('cody') as CodyCodeActionKind
    static readonly QuickFix = vscode.CodeActionKind.QuickFix.append('cody') as CodyCodeActionKind
    static readonly Refactor = vscode.CodeActionKind.Refactor.append('cody') as CodyCodeActionKind
    static readonly RefactorExtract = vscode.CodeActionKind.RefactorExtract.append(
        'cody'
    ) as CodyCodeActionKind
    static readonly RefactorInline = vscode.CodeActionKind.RefactorInline.append(
        'cody'
    ) as CodyCodeActionKind
    static readonly RefactorMove = vscode.CodeActionKind.RefactorMove.append(
        'cody'
    ) as CodyCodeActionKind
    static readonly RefactorRewrite = vscode.CodeActionKind.RefactorRewrite.append(
        'cody'
    ) as CodyCodeActionKind
    static readonly Source = vscode.CodeActionKind.Source.append('cody') as CodyCodeActionKind
    static readonly SourceOrganizeImports = vscode.CodeActionKind.SourceOrganizeImports.append(
        'cody'
    ) as CodyCodeActionKind
    static readonly SourceFixAll = vscode.CodeActionKind.SourceFixAll.append(
        'cody'
    ) as CodyCodeActionKind

    append<S extends string>(parts: RequireActionPartsString<S>): CodyCodeActionKind {
        throw new Error('This method should never actually be invoked!')
    }
}

// This is a bit of typing magic to ensure that strings are dot-delimited camelCase.
type IsCamelCasedString<S extends string> = Record<S, true> extends CamelCasedProperties<Record<S, true>>
    ? true
    : false
type IsValidActionParts<S extends string> = S extends `${infer First}.${infer Rest}`
    ? IsCamelCasedString<First> extends true
        ? IsValidActionParts<Rest>
        : false
    : IsCamelCasedString<S>
type RequireActionPartsString<S extends string> = IsValidActionParts<S> extends true
    ? S
    : string & {
          [InvalidString]: `Input is not a valid dot-separated camelCase string. Did you mean '${CamelCase<S>}' instead?`
      }
