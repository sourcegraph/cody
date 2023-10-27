import { parse } from './utils'

export function generateDummyUser() {
    const content = '{"firstName":"John","lastName":"Doe","age":30}'
    return parse(content)
}
