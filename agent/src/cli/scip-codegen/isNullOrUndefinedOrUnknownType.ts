import type { scip } from './scip'
import { typescriptKeyword } from './utils'

export function isNullOrUndefinedOrUnknownType(type: scip.Type): boolean {
    return (
        type.has_type_ref &&
        type.type_ref.type_arguments.length === 0 &&
        (type.type_ref.symbol === typescriptKeyword('undefined') ||
            type.type_ref.symbol === typescriptKeyword('null') ||
            type.type_ref.symbol === typescriptKeyword('unknown'))
    )
}
