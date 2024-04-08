import type * as vscode from 'vscode'

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
    private constructor() {}
    public static unsafe_createInstance() {
        return new PromptString()
    }

    public toString(): string {
        return promptStringToString(this)
    }

    public getReferences(): Set<StringReference> {
        return promptStringReferences(this)
    }

    public toJSON(): string {
        return this.toString()
    }

    public get length(): number {
        return promptStringToString(this).length
    }

    public slice(start?: number, end?: number): PromptString {
        return makePromptString(promptStringToString(this).slice(start, end), this.getReferences())
    }

    public trim(): PromptString {
        return makePromptString(promptStringToString(this).trim(), this.getReferences())
    }

    public trimEnd(): PromptString {
        return makePromptString(promptStringToString(this).trimEnd(), this.getReferences())
    }

    public static join(promptStrings: PromptString[], boundary: PromptString): PromptString {
        const stringBoundary = promptStringToString(boundary)

        const buffer: string[] = []
        const references: Set<StringReference> = new Set(promptStringReferences(boundary).values())
        for (const promptString of promptStrings) {
            buffer.push(promptStringToString(promptString))
            for (const reference of promptStringReferences(promptString).values()) {
                references.add(reference)
            }
        }

        return makePromptString(buffer.join(stringBoundary), references)
    }
}

type StringReference = vscode.Uri

// This helper function is unsafe and should only be used within this module.
function makePromptString(string: string, references: Set<StringReference>): PromptString {
    const handle = PromptString.unsafe_createInstance()
    pocket.set(handle, new PromptStringPocket(string, references))
    return handle
}

export function promptStringToString(s: PromptString): string {
    return pocket.get(s)!.value
}

export function promptStringReferences(s: PromptString): Set<StringReference> {
    return pocket.get(s)!.references
}

/**
 * Constructs PromptStrings from template literals, numbers or other
 * PromptStrings. A linter in `/lint/safe-prompts.ts` checks that this function
 * is never used except in a tagged template literal.
 *
 * @param format the format string pieces.
 * @param args the arguments to splice into the format string.
 */
export function ps(
    format: TemplateStringsArray,
    ...args: readonly (PromptString | undefined)[]
): PromptString {
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

            if (arg === undefined) {
                // Ignore undefined values
            } else if (arg instanceof PromptString) {
                // PromptString inherit all references
                buffer.push(promptStringToString(arg))
                for (const ref of promptStringReferences(arg).values()) {
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

    return makePromptString(buffer.join(''), references)
}

export function createPromptString(value: string, references: Set<StringReference>): PromptString {
    return makePromptString(value, references)
}

// When PromptStrings are created, their properties are stored in a side pocket
// WeakMap. Consumers can do what they like with the PromptString, all of the
// operations use data in the map and so are protected from the PromptString
// constructor being disclosed, prototype pollution, property manipulation, etc.
const pocket = new WeakMap<PromptString, PromptStringPocket>()

class PromptStringPocket {
    constructor(
        public value: string,
        public references: Set<StringReference>
    ) {}
}
