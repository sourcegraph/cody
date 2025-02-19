// TODO:
// Support labels like foo:
// Support literal enum values, for example the V1 in codyContextFilters(version:V1)
// Support ...on FileChunkContext {
// Support types like [ID!]! which getCodyContext uses
// Consider supporting mutations

// A field with a primitive type or an anonymous object type.
export interface ValueSpec<Name extends string, T> {
    kind: 'value',
    name: Name,
}

// Objects are not primitive types, but [FieldSpec<f1,T1>, FieldSpec<f2,T2>, ...].
export interface ObjectSpec<Name extends string, T extends SomeFields> {
    kind: 'object',
    name: Name,
    fields: T,
}

export interface ArraySpec<Name extends string, T extends SomeFields> {
    kind: 'array',
    name: Name,
    fields: T,
}

// The formal parameters of a GraphQL field.
interface Formal<Name extends string, T> {
    name: Name,
    gqlType: 'Int!' | 'String'
}

export const formal = {
    int<Name extends string>(name: Name): Formal<Name,number> {
        return {
            name,
            gqlType: 'Int!'
        }
    },
    string<Name extends string>(name: Name): Formal<Name,string> {
        return {
            name,
            gqlType: 'String'
        }
    }
}

export interface WithArguments<F extends SomeFieldExceptArguments, T extends Formal<any,any>[]> {
    kind: 'args',
    name: F['name'],
    field: F,
    formals: T
}

export function args<Formals extends Formal<any,any>[], Field extends SomeFieldExceptArguments>(field: Field, ...formals: Formals): WithArguments<Field, Formals> {
    return {
        kind: 'args',
        // Forward the wrapped field's name.
        name: field.name,
        field,
        formals,
    }
}

// In general, don't use these; always use (or infer) specific types. SomeField and
// SomeFields cut down stuttering the list of all field types. We can't use a parent type
// and have ValueSpec extends FieldSpec, ObjectSpec extends FieldSpec because such a parent
// type is not closed: We need our handling to be exhaustive.
type SomeFieldExceptArguments = ValueSpec<any,any> | ObjectSpec<any,any> | ArraySpec<any,any>
type SomeField = SomeFieldExceptArguments | WithArguments<any, any>
type SomeFields = SomeField[]

// Creates a field spec. TypeScript does not have partial application of type parameters,
// so the function is curried so that we can specify the field type but use type inference
// for the field name. For example:
// field<string>()('username') : FieldSpec<'username',string>.
export function field<T>(): <Name extends string>(
    name: Name
) => ValueSpec<Name, T> {
    return <Name extends string>(name: Name) => ({
        kind: 'value',
        name,
    })
}

// A single nested object. Use array for arrays of nested objects.
export function nested<Name extends string, T extends SomeFields>(name: Name, ...fields: T): ObjectSpec<Name, T> {
    return {
        kind: 'object',
        name,
        fields,
    }
}

// An array of nested objects. For primitive arrays, use the regular type for example number[].
export function array<Name extends string, T extends SomeFields>(name: Name, ...fields: T): ArraySpec<Name, T> {
    return {
        kind: 'array',
        name,
        fields,
    }
}

// A list of fields, for top-level queries.
export function fields<T extends SomeFields>(...specs: T) {
    return { specs }
}

// Realizes a TypedName as a concrete type the result will have. For example:
// Realize<[ValueSpec<"id",number>,ValueSpec<"name",string>] => {"id":number, "name":string}
export type Realize<T extends SomeFields> = {
    // Extract<T[number], { name: K }> seems redundant given K is already bound, but
    // T[number] is quantified over all fields, and we want to infer a field type U for each
    // *specific* field. Extract<T[number], { name: K }> indexes the specific field.
    [K in T[number]['name']]: RealizeField<Extract<T[number], { name: K }>>
}

// Handles realizing the single type of some field.
export type RealizeField<F extends SomeField> =
    F extends ObjectSpec<any,any>
        ? Realize<F['fields']>
        : F extends ArraySpec<any,any>
            ? Realize<F['fields']>[]
            : F extends WithArguments<infer U,any>
                ? RealizeField<U>
                : F extends ValueSpec<any, infer U> ? U : never

// Collects the types of arguments.
export type Arguments<F extends SomeField> =
    F extends WithArguments<infer G, infer Args>
        ? [...Args, ...Arguments<G>]
        : F extends ArraySpec<any, any>
            ? ArgumentsOfN<F['fields']>
            : F extends ObjectSpec<any, any>
                ? ArgumentsOfN<F['fields']>
                : F extends ValueSpec<any, any>
                    ? []
                    : never

export type ArgumentsOfN<T extends SomeFields> =
    T extends [infer Head, ...infer Tail]
        // Head and Tail are always SomeField : SomeFields because T extends SomeFields
        // but TypeScript seems unable to prove this, so we must reassure it.
        ? Head extends SomeField
            ? Tail extends SomeFields
                ? [...Arguments<Head>, ...ArgumentsOfN<Tail>]
                : never
            : never
        : []

export type ActualTypes<F extends Formal<any,any>[]> = {
    [K in keyof F]: F[K] extends Formal<any, infer ArgT> ? ArgT : never
}

// Visible for testing.
export function collectFormals<F extends SomeField>(field: F): Arguments<F> {
    // We give up on TypeScript types here an assert as Arguments<F>, claiming that the
    // recursion on the types in Arguments and on the values in collectFormals is equivalent.
    // The reason is simply switching on field.kind === 'args', for example, ensures
    // field: WithArguments<?,?> but without knowledge of F these are existentials.
    // We can't extract detail from F: Extract<F, ...> would be the way to do that, but Extract is
    // only valid in an extends clause; the extends clause must handle failure; a type predicate
    // must be assignable to the parameter type.
    switch (field.kind) {
        case 'args':
            return [...field.formals, ...collectFormals(field.field)] as Arguments<F>
        case 'object':
        case 'array':
            return collectFormalList(field.fields) as Arguments<F>
        case 'value':
            return [] as Arguments<F>
    }
}

// Visible for testing.
export function collectFormalList<F extends SomeFields>(fields: F): ArgumentsOfN<F> {
    return (fields.length === 0 ? [] : [...collectFormals(fields[0]), ...collectFormalList(fields.slice(1))]) as ArgumentsOfN<F>
}

// Our classic approach: Text with no typing:
// query Repositories($first: Int!, $after: String, $query: String) {
//     repositories(first: $first, after: $after, query: $query) {
//         nodes {
//             id
//             name
//         }
//         pageInfo {
//             endCursor
//         }
//     }
// }

// New approach: Combinators *with* types.
export const q = {
    boolean: field<boolean>(),
    string: field<string>(),
    number: field<number>(),
};

export function both<T extends SomeField, U extends SomeField>(a: T, b: U) {
    return [a, b]
}

function serializeField<T extends SomeField>(buffer: string[], argumentNames: string[], field: SomeField, parent: SomeField | undefined): void {
    switch (field.kind) {
        case 'args':
            buffer.push(field.name, '(')
            for (const formal of field.formals) {
                // Gensym unique argument names.
                const argumentName = `\$${formal.name}${arguments.length}`
                argumentNames.push(argumentName)
                buffer.push(formal.name, ':', argumentName, ',')
            }
            buffer.push(')')
            serializeField(buffer, argumentNames, field.field, field)
            break
        case 'object':
        case 'array':
            if (parent?.kind !== 'args') {
                // We model objects and arrays as a typed name to keep the type parameters
                // for field names and types together. GraphQL syntax puts arguments after
                // field names, for example repository(name: $name42: String, ...), hence this
                // quirk of checking if the parent is args which already generated the name.
                buffer.push(field.name)
            }
            buffer.push('{')
            field.fields.forEach((child: SomeField) => {
                serializeField(buffer, argumentNames, child, field)
                buffer.push(',')
            })
            buffer.push('}')
            break
        case 'value':
            buffer.push(field.name)
            break
        default:
            throw new Error('unreachable')
    }
}

export type PreparedQuery<T extends SomeFields> = {
    query: T,
    text: string,
    argumentNames: string[],
}

// Prepares a query by producing the textual serialization of the query.
export function prepare<T extends SomeFields>(...query: T): PreparedQuery<T> {
    const buffer: string[] = []
    const argumentNames: string[] = []
    for (const field of query) {
        serializeField(buffer, argumentNames, field, undefined)
    }

    // Wrap the query in query (...args...) { ... }
    const preamble: string[] = []
    preamble.push('query', '(')
    for (const argumentName of argumentNames) {
        preamble.push(argumentName, ',')
    }
    preamble.push(')', '{')
    buffer.unshift(...preamble)
    buffer.push('}')

    return {
        query,
        text: buffer.join(''),
        argumentNames,
    }
}

export const currentUserId = prepare(nested('currentUser', q.string('id')))
