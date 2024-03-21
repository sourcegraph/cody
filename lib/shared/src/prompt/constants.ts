export const ANSWER_TOKENS = 1000
export const MAX_HUMAN_INPUT_TOKENS = 1000
export const MAX_CURRENT_FILE_TOKENS = 1000
export const CHARS_PER_TOKEN = 4
export const SURROUNDING_LINES = 50
export const NUM_CODE_RESULTS = 12
export const NUM_TEXT_RESULTS = 3

export const MAX_BYTES_PER_FILE = 4096

export function tokensToChars(tokens: number): number {
    return tokens * CHARS_PER_TOKEN
}
