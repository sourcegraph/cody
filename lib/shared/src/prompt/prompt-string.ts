import dedent from 'dedent'
import type * as vscode from 'vscode'
import { markdownCodeBlockLanguageIDForFilename } from '../common/languages'
import { ActiveTextEditorDiagnostic } from '../editor'
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
            this.getReferences()
        )
    }

    public trim(): PromptString {
        return internal_createPromptString(internal_toString(this).trim(), this.getReferences())
    }

    public trimEnd(): PromptString {
        return internal_createPromptString(internal_toString(this).trimEnd(), this.getReferences())
    }

    public static join(promptStrings: PromptString[], boundary: PromptString): PromptString {
        const stringBoundary = internal_toString(boundary)

        const buffer: string[] = []
        const references: Set<StringReference> = new Set(boundary.getReferences())
        for (const promptString of promptStrings) {
            if (!isValidPromptString(promptString)) {
                throw new Error('Invalid prompt string')
            }

            buffer.push(internal_toString(promptString))
            for (const reference of promptString.getReferences()) {
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
            references.push(promptString.getReferences())
        }

        return internal_createPromptString(internal_toString(this).concat(...stringPromptString), [
            ...this.getReferences(),
            ...references.flat(),
        ])
    }

    public replaceAll(searchValue: string, replaceValue: PromptString): PromptString {
        if (!isValidPromptString(replaceValue)) {
            throw new Error('Invalid prompt string')
        }

        const stringReplaceValue = internal_toString(replaceValue)
        const references = replaceValue.getReferences()

        return internal_createPromptString(
            internal_toString(this).replaceAll(searchValue, stringReplaceValue),
            [...this.getReferences(), ...references]
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
        template: PromptString,
        diagnostic: ActiveTextEditorDiagnostic,
        uri: vscode.Uri
    ): PromptString {
        const templateString = internal_toString(template)
        const templateReferences = internal_toReferences(template)

        const replaced = templateString
            .replace('{type}', diagnostic.type)
            .replace('{filePath}', displayPath(uri))
            .replace('{prefix}', diagnostic.type)
            .replace('{message}', diagnostic.message)
            .replace('{languageID}', markdownCodeBlockLanguageIDForFilename(uri))
            .replace('{code}', diagnostic.text)

        return internal_createPromptString(replaced, [...templateReferences, uri])
    }

    public static fromMarkdownCodeBlockLanguageIDForFilename(uri: vscode.Uri) {
        return internal_createPromptString(markdownCodeBlockLanguageIDForFilename(uri), [uri])
    }

    // 🚨 Use this function only for user-generated queries.
    // TODO: Can we detect if the user is pasting in content from a document?
    public static unsafe_fromUserQuery(string: string): PromptString {
        return internal_createPromptString(string, [])
    }
}

// Validate that an input is indeed a PromptString and not just typecast to it.
export function isValidPromptString(promptString: PromptString) {
    if (pocket.has(promptString)) {
        return true
    }
    return false
}

type StringReference = vscode.Uri

// This helper function is unsafe and should only be used within this module.
function internal_createPromptString(
    string: string,
    references: readonly StringReference[]
): PromptString {
    const handle = new PromptString()
    pocket.set(handle, new PromptStringPocket(string, references))
    return handle
}

/**
 * Constructs PromptStrings from template literals, numbers or other
 * PromptStrings. A linter in `/lint/safe-prompts.ts` checks that this function
 * is never used except in a tagged template literal.
 *
 * @param format the format string pieces.
 * @param args the arguments to splice into the format string.
 */
export function ps(format: TemplateStringsArray, ...args: readonly (PromptString | '')[]): PromptString {
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

            if (arg === '') {
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
export function psDedent(
    format: TemplateStringsArray,
    ...args: readonly (PromptString | '')[]
): PromptString {
    const promptString = ps(format, ...args)
    const dedented = dedent(internal_toString(promptString))
    return internal_createPromptString(dedented, promptString.getReferences())
}

export function temporary_createPromptString(
    value: string,
    references: readonly StringReference[]
): PromptString {
    return internal_createPromptString(value, references)
}

// When PromptStrings are created, their properties are stored in a side pocket
// WeakMap. Consumers can do what they like with the PromptString, all of the
// operations use data in the map and so are protected from the PromptString
// constructor being disclosed, prototype pollution, property manipulation, etc.
const pocket = new WeakMap<PromptString, PromptStringPocket>()

class PromptStringPocket {
    constructor(
        public value: string,
        public references: readonly StringReference[]
    ) {}
}

interface ConfigGetter<T> {
    get<T>(section: string, defaultValue?: T): T
}

function internal_toString(s: PromptString): string {
    return pocket.get(s)!.value
}
function internal_toReferences(s: PromptString): readonly StringReference[] {
    const ref = pocket.get(s)!.references
    Object.freeze(ref)
    return ref
}
