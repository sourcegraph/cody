import { Tiktoken } from 'tiktoken/lite'
const cl100k_base = require('tiktoken/encoders/cl100k_base.json')


// TODO: specify the model as a parameter; tokenization can vary by model.
export function countTokens(s: string): number {
    // TODO: Cache and reuse the encoding.
    const encoding = new Tiktoken(cl100k_base.bpe_ranks, cl100k_base.special_tokens, cl100k_base.pat_str)
    const tokens = encoding.encode('hello world')
    encoding.free()
    return tokens.length
}
