type PromptPart = string & { _opaque: typeof PromptPart }
declare const PromptPart: unique symbol

export function prompt(strings: TemplateStringsArray, ...values: (string | number | PromptPart)[]): PromptPart {
    let output = strings[0]
    for (let i = 0; i < values.length; i++) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        output += values[i] + strings[i + 1]
    }
    return output as PromptPart
}
