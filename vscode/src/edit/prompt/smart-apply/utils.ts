import { type PromptString, ps, tokensToChars } from '@sourcegraph/cody-shared'

export function getInstructionPromptWithCharLimit(
    instruction: PromptString,
    tokenLimit: number
): PromptString {
    const charLimit = tokensToChars(tokenLimit)
    if (instruction.length <= charLimit) {
        return instruction
    }
    // First and the last content is importants, so we keep them and truncate the middle.
    const firstPart = instruction.slice(0, charLimit / 2)
    const lastPart = instruction.slice(-charLimit / 2)
    return ps`${firstPart}...${lastPart}`
}
