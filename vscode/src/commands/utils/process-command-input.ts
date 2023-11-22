export function parseInputToCommands(userInput: string): { key: string; request?: string } {
    if (!userInput.startsWith('/')) {
        return { key: '/ask', request: userInput }
    }

    const inputParts = userInput.split(' ')

    // The unique key for the command. e.g. /test
    const key = inputParts.shift() || userInput

    // Additional instruction that will be added to end of prompt in the custom-prompt recipe
    const instruction = key === userInput ? '' : inputParts.join(' ')
    const request = instruction.trim() || undefined

    return { key, request }
}
