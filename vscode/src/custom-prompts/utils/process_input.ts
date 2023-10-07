export const flags = ['-c']
/**
 * Splits input string into command and arguments strings.
 *
 * Looks for '-c' in input string to split into command and arguments.
 * Returns array with command string (trimmed) and arguments string (trimmed).
 *
 * If no '-c' split or input is undefined, returns empty strings.
 */
export function extractCommandArgs(input?: string): [string, string] {
    if (input) {
        const splitInput = input.split('-c')
        if (splitInput.length > 1) {
            // Gets last element as args string
            // example: ['foo', '-c', 'bar', '-c', 'baz'] -> 'baz'
            // Then, join splitInput again but remove the last element if it's '-c'
            // example: ['foo', '-c', 'bar', '-c'] -> ['foo', '-c', 'bar']
            const args = splitInput.at(-1) || ''
            // Joins all but last element as command string
            return [splitInput.slice(0, -1).join('-c').trim(), args.trim()]
        }
    }
    return [input || '', '']
}
