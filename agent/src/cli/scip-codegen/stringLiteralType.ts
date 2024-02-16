import type { scip } from './scip'

export function stringLiteralType(type: scip.Type): string | undefined {
    if (!type.has_constant_type) {
        return undefined
    }
    if (!type.constant_type.constant.has_string_constant) {
        return undefined
    }
    return type.constant_type.constant.string_constant.value
}
