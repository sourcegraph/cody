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
    public toString(): string {
        return promptStringToString(this)
    }

    public toJSON(): string {
        return this.toString()
    }

    public get length(): number {
        return promptStringToString(this).length
    }

    public slice(start?: number, end?: number): PromptString {
        return makePromptString(promptStringToString(this).slice(start, end))
    }

    public trim(): PromptString {
        return makePromptString(promptStringToString(this).trim())
    }

    public trimEnd(): PromptString {
        return makePromptString(promptStringToString(this).trimEnd())
    }
}

// This helper function is unsafe and should only be used within this module.
function makePromptString(s: string): PromptString {
    const handle = new PromptString()
    pocket.set(handle, new PromptStringPocket(s))
    return handle
}

export function promptStringToString(s: PromptString): string {
    return pocket.get(s)!.value
}

/**
 * Constructs PromptStrings from template literals, numbers or other
 * PromptStrings. A linter in `/lint/safe-prompts.ts` checks that this function
 * is never used except in a tagged template literal.
 *
 * @param format the format string pieces.
 * @param args the arguments to splice into the format string.
 */
export function ps(format: TemplateStringsArray, ...args: readonly any[]): PromptString {
    if (!(Array.isArray(format) && Object.isFrozen(format) && format.length > 0)) {
        // Deter casual direct calls.
        throw new Error('ps is only intended to be used in tagged template literals.')
    }

    const buffer = [format[0]]
    for (let i = 0; i < format.length; i++) {
        const arg = args[i]
        // Do not add arbitrary types like dynamic strings, classes with
        // toString, etc. here.
        if (arg instanceof String) {
            throw new Error(
                'Use ps`...` or a PromptString helper to handle string data for prompts safely.'
            )
        }
        if (arg instanceof PromptString) {
            buffer.push(promptStringToString(arg))
        } else if (arg instanceof Number) {
            // An attacker could poison Number.prototype and defeat this, but
            // this allows numbers while detering casual toString overriding.
            buffer.push(Number.prototype.toString.call(arg))
        }
    }
    buffer.push(format[format.length - 1])

    return makePromptString(buffer.join(''))
}

// When PromptStrings are created, their properties are stored in a side pocket
// WeakMap. Consumers can do what they like with the PromptString, all of the
// operations use data in the map and so are protected from the PromptString
// constructor being disclosed, prototype pollution, property manipulation, etc.
const pocket = new WeakMap<PromptString, PromptStringPocket>()

class PromptStringPocket {
    constructor(public value: string) {}
}
