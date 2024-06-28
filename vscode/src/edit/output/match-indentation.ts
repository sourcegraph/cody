import detectIndent, { type Indent } from 'detect-indent'

type IndentationCharacter = ' ' | '\t'

/**
 * Translates the indentation of the given string from one indentation style to another.
 */
function translateIndentation(
    incoming: string,
    fromIdentString: string,
    toIndentString: string
): string {
    const incomingLines = incoming.split('\n')
    const fromIndentRegex = new RegExp(`^(${fromIdentString})+`)

    const fixedLines = incomingLines.map(line => {
        const match = line.match(fromIndentRegex)
        if (match) {
            const fromIndentCount = match[0].length / fromIdentString.length
            const newIndentation = toIndentString.repeat(fromIndentCount)
            return line.replace(fromIndentRegex, newIndentation)
        }
        return line
    })

    return fixedLines.join('\n')
}

/**
 * Attempts to fix the indentation of the incoming string to match the indentation of the original string.
 *
 * This function first checks if the indentation type (spaces vs tabs) is different between the incoming and original strings.
 * If so, it translates the indentation of the incoming string to match the indentation type of the original string.
 *
 * Next, it compares the indentation of the first line of the incoming and original strings. If they are the same, it assumes the rest of the indentation is correct and returns the fixed replacement.
 *
 * If the first line indentation is different, it calculates the difference and applies that difference to the rest of the lines in the incoming string.
 */
function fixIndentation(
    _incoming: string,
    incomingIndentation: Indent,
    original: string,
    originalIndentation: Indent,
    indentationCharacter: IndentationCharacter
): string {
    let fixedReplacement = _incoming

    if (incomingIndentation.type !== originalIndentation.type) {
        fixedReplacement = translateIndentation(
            fixedReplacement,
            incomingIndentation.indent,
            originalIndentation.indent
        )
    }

    const originalFirstLineIndent = original.length - original.trimStart().length
    const incomingFirstLineIndent = fixedReplacement.length - fixedReplacement.trimStart().length
    if (originalFirstLineIndent === incomingFirstLineIndent) {
        // First line indentation was the same, assume the LLM got the rest correct
        return fixedReplacement
    }

    const difference = originalFirstLineIndent - incomingFirstLineIndent
    const incomingLines = fixedReplacement.split('\n')
    const secondLine = incomingLines[1]
    const incomingSecondLineIndent = secondLine
        ? secondLine.length - secondLine.trimStart().length
        : null

    if (
        incomingSecondLineIndent !== null &&
        incomingFirstLineIndent === 0 &&
        incomingSecondLineIndent !== 0 &&
        incomingSecondLineIndent + difference !== originalFirstLineIndent + originalIndentation.amount
    ) {
        // First line had too little indentation, but the second line has too much, it is likely
        // that the LLM only got the first line incorrect, so only adjust this.
        return indentationCharacter.repeat(originalFirstLineIndent) + fixedReplacement.trimStart()
    }

    return incomingLines
        .map((line, i) => {
            const trimmedLine = line.trimStart()
            if (trimmedLine.length === 0) {
                // empty line, do nothing
                return line
            }

            const lineIndentation = line.length - trimmedLine.length
            const correctedIndentation = lineIndentation + difference
            if (indentationCharacter === '\t' || correctedIndentation % 2 === 0) {
                // Corrected indentation is valid, use this.
                return indentationCharacter.repeat(correctedIndentation) + trimmedLine
            }

            return line
        })
        .join('\n')
}

/**
 * Matches the indentation of an incoming string to the indentation of an original string.
 *
 * This function attempts to fix any issues with the indentation of the incoming string, such as
 * incorrect indentation type (spaces vs tabs) or incorrect indentation amount. It then compares
 * the indentation of the incoming string to the indentation of the original string, and adjusts
 * the indentation of the incoming string to match the original.
 */
export function matchIndentation(incoming: string, original: string): string {
    const originalIndentation = detectIndent(original)
    if (originalIndentation.amount === 0) {
        // No indentation detected, this may be simply because the file is not populated enough.
        // We cannot reliably update the incoming indentation so we will just return the unmodified string.
        return incoming
    }
    const incomingIndentation = detectIndent(incoming)
    const indentationCharacter = originalIndentation.type === 'tab' ? '\t' : ' '

    // LLMs will often get the initial indentation wrong, this will generally be in two ways:
    // 1. Incorrect indentation used (e.g. spaces instead of tabs)
    // 2. Incorrect indentation used for surrounding code (e.g. LLM assumes code is indented from character 0)
    // Here we will attempt to fix both of these. This is required in order to have a fair comparison on
    // the indentation amounts.
    const updatedIndentation = fixIndentation(
        incoming,
        incomingIndentation,
        original,
        originalIndentation,
        indentationCharacter
    )

    // At this point the indentation is "normal", so we can compare the indentation amounts
    // It may still be that the LLM produced code that is indented too much, or too little.
    // We must now fix that.
    const updatedIncomingIndentation = detectIndent(updatedIndentation)
    const indentationDifference = originalIndentation.amount - updatedIncomingIndentation.amount

    if (indentationDifference === 0) {
        // No difference in indentation amounts.
        return updatedIndentation
    }

    if (
        originalIndentation.type === 'space' &&
        (originalIndentation.amount === 1 || incomingIndentation.amount === 1)
    ) {
        // There are cases where detect-indent will wrongly detect a most common indentation difference of a single space.
        // This is primarily in cases where, e.g., there are mostly multi-line comments in the original/incoming string.
        // It is very unlikely that the user will be using a single space for indentation, so we skip this case.
        return updatedIndentation
    }

    // The incoming indentation still does not match the original, so we need to add/remove
    // the remaining amount of indentation to the incoming lines.
    return updatedIndentation
        .split('\n')
        .map(line => {
            const trimmedLine = line.trimStart()
            if (trimmedLine.length === 0) {
                // empty line, do nothing
                return line
            }
            const lineIndentation = line.length - trimmedLine.length
            if (lineIndentation === 0) {
                // No existing indentation, do nothing
                return line
            }

            const indentationAdjustment = lineIndentation + indentationDifference
            return indentationCharacter.repeat(indentationAdjustment) + trimmedLine
        })
        .join('\n')
}
