import * as tokenizer from '@anthropic-ai/tokenizer'

export function countToken2(text: string): number {
    return tokenizer.countTokens(text)
}
