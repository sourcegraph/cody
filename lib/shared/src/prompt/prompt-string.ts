import dedent from 'dedent'
import type * as vscode from 'vscode'
import { markdownCodeBlockLanguageIDForFilename } from '../common/languages'
import type { ActiveTextEditorDiagnostic } from '../editor'
import { createGitDiff } from '../editor/create-git-diff'
import { displayPath } from '../editor/displayPath'
import { getEditorInsertSpaces, getEditorTabSize } from '../editor/utils'

// This module is designed to encourage, and to some degree enforce, safe
// handling of file content that gets constructed into prompts. It works this
// way:
//
// - Literal strings are considered "safe". Literal strings are constructed with
//   a tagged template function, `ps`, and a linter in `/lint/safe-prompts.ts`
//   ensures the function is only used in a tagged template literal, not
//   aliased, etc.
// - There are a small set of functions for conveniently constructing strings
//   from file contents. Use of these functions needs to be continually audited
//   to ensure they're safe.
// - Strings constructed from other safe strings, with `ps` or helper methods,
//   are also safe.
// - Components sending prompts to LLMs should consume safe strings, not raw
//   strings.
//
// This setup is designed to detect programming errors, not thwart malicious
// attacks.

/**
 * A "safe" string class for constructing prompts.
 */
export class PromptString {
    /**
     * @deprecated Do not use the constructor directly. Instead, use ps`...` or a
     * PromptString helper to handle string data for prompts safely
     */
    // biome-ignore lint/complexity/noUselessConstructor: deprecation notice
    constructor() {}

    public toString(): string {
        return internal_toString(this)
    }

    public getReferences(): readonly StringReference[] {
        return internal_toReferences(this)
    }

    public toJSON(): string {
        return internal_toString(this)
    }

    public get length(): number {
        return internal_toString(this).length
    }

    public slice(start?: number, end?: number): PromptString {
        return internal_createPromptString(
            internal_toString(this).slice(start, end),
            internal_toReferences(this)
        )
    }

    public trim(): PromptString {
        return internal_createPromptString(internal_toString(this).trim(), internal_toReferences(this))
    }

    public trimEnd(): PromptString {
        return internal_createPromptString(
            internal_toString(this).trimEnd(),
            internal_toReferences(this)
        )
    }

    public indexOf(searchString: string | PromptString, start?: number): number {
        return this.toString().indexOf(searchString.toString(), start)
    }

    public split(separator: string): PromptString[] {
        const string = internal_toString(this)
        const references = internal_toReferences(this)

        const split = string.split(separator)
        const result: PromptString[] = []
        for (const part of split) {
            result.push(internal_createPromptString(part, references))
        }
        return result
    }

    public static join(promptStrings: PromptString[], boundary: PromptString): PromptString {
        const stringBoundary = internal_toString(boundary)

        const buffer: string[] = []
        const references: Set<StringReference> = new Set(internal_toReferences(boundary))
        for (const promptString of promptStrings) {
            if (!isValidPromptString(promptString)) {
                throw new Error('Invalid prompt string')
            }

            buffer.push(internal_toString(promptString))
            for (const reference of internal_toReferences(promptString)) {
                references.add(reference)
            }
        }

        return internal_createPromptString(buffer.join(stringBoundary), [...references])
    }

    public concat(...promptStrings: readonly PromptString[]): PromptString {
        const stringPromptString: string[] = []
        const references: (readonly StringReference[])[] = []
        for (const promptString of promptStrings) {
            stringPromptString.push(internal_toString(promptString))
            references.push(internal_toReferences(promptString))
        }

        return internal_createPromptString(internal_toString(this).concat(...stringPromptString), [
            ...internal_toReferences(this),
            ...references.flat(),
        ])
    }

    public replace(searchValue: string | RegExp, replaceValue: PromptString): PromptString {
        const stringReplaceValue = internal_toString(replaceValue)
        const references = internal_toReferences(replaceValue)

        return internal_createPromptString(
            internal_toString(this).replace(searchValue, stringReplaceValue),
            [...internal_toReferences(this), ...references]
        )
    }

    public replaceAll(searchValue: string | RegExp, replaceValue: PromptString): PromptString {
        const stringReplaceValue = internal_toString(replaceValue)
        const references = internal_toReferences(replaceValue)

        return internal_createPromptString(
            internal_toString(this).replaceAll(searchValue, stringReplaceValue),
            [...internal_toReferences(this), ...references]
        )
    }

    // Use this function to create a user-generated PromptString from the VS Code
    // configuration object.
    public static fromConfig(
        config: ConfigGetter<string>,
        path: string,
        defaultValue: PromptString
    ): PromptString {
        const raw = config.get<string | null>(path, null)
        const value = raw === null ? defaultValue : internal_createPromptString(raw, [])
        return value
    }

    public static fromEditorIndentString(
        uri: vscode.Uri,
        workspace: Pick<typeof vscode.workspace, 'getConfiguration'>,
        window: Pick<typeof vscode.window, 'visibleTextEditors'>
    ) {
        const insertSpaces = getEditorInsertSpaces(uri, workspace, window)
        const tabSize = getEditorTabSize(uri, workspace, window)

        const indentString = insertSpaces ? ' '.repeat(tabSize) : '\t'
        // Note: even though this uses the URI, it does not actually contain any
        // information from the URI, so we leave the references empty for now (the
        // content is always just whitespace)
        return internal_createPromptString(indentString, [])
    }

    public static fromDisplayPath(uri: vscode.Uri) {
        return internal_createPromptString(displayPath(uri), [uri])
    }

    public static fromDocumentText(document: vscode.TextDocument, range?: vscode.Range): PromptString {
        return internal_createPromptString(document.getText(range), [document.uri])
    }

    public static fromGitDiff(uri: vscode.Uri, oldContent: string, newContent: string) {
        const diff = createGitDiff(displayPath(uri), oldContent, newContent)
        return internal_createPromptString(diff, [uri])
    }

    // Replaces the following placeholder with data from the diagnostics:
    // {type}, {filePath}, {prefix}, {message}, {languageID}, {code}
    //
    // TODO: This should probably take a vscode.Diagnostic object instead.
    public static fromTextEditorDiagnostic(
        diagnostic: ActiveTextEditorDiagnostic,
        uri: vscode.Uri
    ): {
        type: PromptString
        text: PromptString
        message: PromptString
    } {
        return {
            type: internal_createPromptString(diagnostic.type, [uri]),
            text: internal_createPromptString(diagnostic.text, [uri]),
            message: internal_createPromptString(diagnostic.message, [uri]),
        }
    }

    public static fromMarkdownCodeBlockLanguageIDForFilename(uri: vscode.Uri) {
        return internal_createPromptString(markdownCodeBlockLanguageIDForFilename(uri), [uri])
    }

    public static fromDiagnostic(uri: vscode.Uri, diagnostic: vscode.Diagnostic) {
        return internal_createPromptString(diagnostic.message, [uri])
    }

    public static fromDocumentSymbol(
        uri: vscode.Uri,
        documentSymbol: vscode.DocumentSymbol,
        SymbolKind: typeof vscode.SymbolKind
    ) {
        const symbolKind = documentSymbol.kind ? SymbolKind[documentSymbol.kind].toLowerCase() : ''
        const symbolPrompt = documentSymbol.name ? `#${documentSymbol.name} (${symbolKind})` : ''
        return internal_createPromptString(symbolPrompt, [uri])
    }

    // TODO: Find a better way to handle this. Maybe we should migrate the default commands json to
    // a TypesScript object?
    public static fromDefaultCommands(
        commands: { [name: string]: { prompt: string } },
        name: 'doc' | 'explain' | 'test' | 'smell'
    ) {
        const prompt = commands[name].prompt
        return internal_createPromptString(prompt, [])
    }

    // TODO: Need to check in the runtime if we have something we can append as an URI here
    public static fromTerminalOutputArguments(output: TerminalOutputArguments) {
        return {
            name: internal_createPromptString(output.name, []),
            selection: output.selection ? internal_createPromptString(output.selection, []) : undefined,
            creationOptions: output.creationOptions
                ? internal_createPromptString(JSON.stringify(output.creationOptions), [])
                : undefined,
        }
    }

    // TODO: Should we refactor the AC doc context to use PromptString instead of string?
    public static fromAutocompleteDocContext(docContext: DocumentContext, uri: vscode.Uri) {
        return {
            prefix: internal_createPromptString(docContext.prefix, [uri]),
            suffix: internal_createPromptString(docContext.suffix, [uri]),
            injectedPrefix: docContext.injectedPrefix
                ? internal_createPromptString(docContext.injectedPrefix, [uri])
                : null,
        }
    }

    // TODO: Should we propagate the PromptString into the context objects? It would
    // mean a lot of refactoring but it could avoid this helper method (since I
    // assume we use the getText API when we build these values)
    public static fromAutocompleteContextSnippet(
        contextSnippet: FileContextSnippet | SymbolContextSnippet
    ) {
        return {
            content: internal_createPromptString(contextSnippet.content, [contextSnippet.uri]),
            symbol:
                'symbol' in contextSnippet
                    ? internal_createPromptString(contextSnippet.symbol, [contextSnippet.uri])
                    : undefined,
        }
    }

    // 🚨 Use this function only for user-generated queries.
    // TODO: Can we detect if the user is pasting in content from a document?
    public static unsafe_fromUserQuery(string: string): PromptString {
        return internal_createPromptString(string, [])
    }
}

type TemplateArgs = readonly (PromptString | '' | number)[]

/**
 * Constructs PromptStrings from template literals, numbers or other
 * PromptStrings. A linter in `/lint/safe-prompts.ts` checks that this function
 * is never used except in a tagged template literal.
 *
 * @param format the format string pieces.
 * @param args the arguments to splice into the format string.
 */
export function ps(format: TemplateStringsArray, ...args: TemplateArgs): PromptString {
    if (!(Array.isArray(format) && Object.isFrozen(format) && format.length > 0)) {
        // Deter casual direct calls.
        throw new Error('ps is only intended to be used in tagged template literals.')
    }

    const buffer: string[] = []
    const references: Set<StringReference> = new Set()
    for (let i = 0; i < format.length; i++) {
        buffer.push(format[i])
        if (i < args.length) {
            const arg = args[i]

            if (typeof arg === 'number') {
                // Boxed number types are not allowed, only number literals
                buffer.push(Number.prototype.toString.call(arg))
            } else if (arg === '') {
                // We allow empty strings for situations like this:
                // ps`... ${foo ? foo : ''}...`
            } else if (arg instanceof PromptString) {
                // PromptString inherit all references
                buffer.push(internal_toString(arg))
                for (const ref of internal_toReferences(arg)) {
                    references.add(ref)
                }
            } else {
                // Do not allow arbitrary types like dynamic strings, classes with
                // toString, etc. here.
                throw new Error(
                    'Use ps`...` or a PromptString helper to handle string data for prompts safely.'
                )
            }
        }
    }

    return internal_createPromptString(buffer.join(''), [...references])
}

// A version of ps that removes the leading indentation of the first line.
export function psDedent(format: TemplateStringsArray, ...args: TemplateArgs): PromptString {
    const promptString = ps(format, ...args)
    const dedented = dedent(internal_toString(promptString))
    return internal_createPromptString(dedented, internal_toReferences(promptString))
}

// TODO: This is only temporarily exposed for writing tests.
export function unsafe_temporary_createPromptString(
    value: string,
    references: readonly StringReference[]
): PromptString {
    return internal_createPromptString(value, references)
}

// When PromptStrings are created, their properties are stored in a side pocket
// WeakMap. Consumers can do what they like with the PromptString, all of the
// operations use data in the map and so are protected from the PromptString
// constructor being disclosed, prototype pollution, property manipulation, etc.
type StringReference = vscode.Uri
const pocket = new WeakMap<PromptString, PromptStringPocket>()
class PromptStringPocket {
    constructor(
        public value: string,
        // We're using a set inside the pocket so we get deduplication for free and
        // by converting from array (input) to Set, we also guarantee shallow copies
        // are being created.
        public references: Set<StringReference>
    ) {}
}

function internal_createPromptString(
    string: string,
    references: readonly StringReference[]
): PromptString {
    const handle = new PromptString()
    // Create a shallow copy of the references list as a set, so it's both de-duped
    // and can not be mutated by the caller
    pocket.set(handle, new PromptStringPocket(string, new Set(references)))
    return handle
}
function internal_toString(s: PromptString): string {
    return pocket.get(s)!.value
}
function internal_toReferences(s: PromptString): readonly StringReference[] {
    // Return a shallow copy of the references so it can not be mutated
    // TODO: Do we need to create an array or can we expose the iterator?
    return [...pocket.get(s)!.references.values()]
}

// Validate that an input is indeed a PromptString and not just typecast to it.
export function isValidPromptString(promptString: PromptString) {
    return pocket.has(promptString)
}

// TODO: move this to shared
interface ConfigGetter<T> {
    get<T>(section: string, defaultValue?: T): T
}

// TODO: move this to shared
interface TerminalOutputArguments {
    name: string
    selection?: string
    creationOptions?: { shellPath?: string; shellArgs?: string[] }
}

// TODO: move this to shared
interface DocumentContext extends DocumentDependentContext {
    position: vscode.Position
    multilineTrigger: string | null
    multilineTriggerPosition: vscode.Position | null
    /**
     * A temporary workaround for the fact that we cannot modify `TextDocument` text.
     * Having these fields set on a `DocumentContext` means we can still get the full
     * document text in the `parse-completion` function with the "virtually" inserted
     * completion text.
     *
     * TODO(valery): we need a better abstraction that would allow us to mutate
     * the `TextDocument` text in memory without actually pasting it into the `TextDocument`
     * and that would not require copy-pasting and modifying the whole document text
     * on every completion update or new virtual completion creation.
     */
    injectedCompletionText?: string
    positionWithoutInjectedCompletionText?: vscode.Position
}

// TODO: move this to shared
interface DocumentDependentContext {
    prefix: string
    suffix: string
    /**
     * This is set when the document context is looking at the selected item in the
     * suggestion widget and injects the item into the prefix.
     */
    injectedPrefix: string | null
}

// TODO: move this to shared
interface FileContextSnippet {
    uri: vscode.Uri
    startLine: number
    endLine: number
    content: string
}

// TODO: move this to shared
export interface SymbolContextSnippet extends FileContextSnippet {
    symbol: string
}
