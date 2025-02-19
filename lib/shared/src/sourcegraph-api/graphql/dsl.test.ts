import { describe, expect, test } from "vitest"

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

const formal = {
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

function args<Formals extends Formal<any,any>[], Field extends SomeFieldExceptArguments>(field: Field, ...formals: Formals): WithArguments<Field, Formals> {
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
export function array<Name extends string, T extends SomeFields>(name: Name, fields: T): ArraySpec<Name, T> {
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
type RealizeField<F extends SomeField> =
    F extends ObjectSpec<any,any>
        ? Realize<F['fields']>
        : F extends ArraySpec<any,any>
            ? Realize<F['fields']>[]
            : F extends WithArguments<infer U,any>
                ? RealizeField<U>
                : F extends ValueSpec<any, infer U> ? U : never

// Collects the types of arguments.
type Arguments<F extends SomeField> =
    F extends WithArguments<infer G, infer Args>
        ? [...Args, ...Arguments<G>]
        : F extends ArraySpec<any, any>
          ? ArgumentsOfN<F['fields']>
          : F extends ObjectSpec<any, any>
            ? ArgumentsOfN<F['fields']>
            : F extends ValueSpec<any, any>
              ? []
              : never

type ArgumentsOfN<T extends SomeFields> =
    T extends [infer Head, ...infer Tail]
        // Head and Tail are always SomeField : SomeFields because T extends SomeFields
        // but TypeScript seems unable to prove this, so we must reassure it.
        ? Head extends SomeField
            ? Tail extends SomeFields
                ? [...Arguments<Head>, ...ArgumentsOfN<Tail>]
                : never
            : never
        : []

type ActualTypes<F extends Formal<any,any>[]> = {
    [K in keyof F]: F[K] extends Formal<any, infer ArgT> ? ArgT : never
}

function collectFormals<F extends SomeField>(field: F): Arguments<F> {
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

function collectFormalList<F extends SomeFields>(fields: F): ArgumentsOfN<F> {
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
const q = {
    string: field<string>(),
    number: field<number>(),
};

describe('arguments', () => {
    test('top-level arguments appear in formals', () => {
        let test = args(nested('foo',
            q.string('baz')
        ), formal.int('bar'));
        let fs: Arguments<typeof test> = collectFormals(test) // [formal.int('bar')]
        expect(fs).toEqual([formal.int('bar')])
        // @ts-ignore TS6133 testing the type checker
        let as: ActualTypes<Arguments<typeof test>> = [7]
        // @ts-ignore TS6133 testing the type checker
        let result: Realize<typeof test.field.fields> = {
            'baz': 'hello'
        };
    })

    test('nested arguments appear in formals', () => {
        let test = nested('foo',
            nested('bar', args(q.string('baz'), formal.int('bar')))
        )
        let fs: Arguments<typeof test> = collectFormals(test)
        expect(fs).toEqual([formal.int('bar')])
        // @ts-ignore TS6133 testing the type checker
        let as: ActualTypes<Arguments<typeof test>> = [7]
        // @ts-ignore TS6133 testing the type checker
        let result: Realize<typeof test.fields> = {
            'bar': {'baz': 'hello'},
        }
    })

    test('repository query', () => {
        // Note, `as const` necessary here for arguments to be typed in order.
        let repositories = args(nested('repositories',
            array('nodes', [
                q.string('id'),
                q.string('name'),
            ] as const),
            nested('pageInfo',
                args(q.string('endCursor'), formal.string('format'))
            )
        ), formal.int('first'), formal.string('after'), formal.string('query'))

        type RepositoriesParams = Arguments<typeof repositories>
        let fs: RepositoriesParams = collectFormals(repositories)
        expect(fs).toEqual([
            formal.int('first'),
            formal.string('after'),
            formal.string('query'),
            formal.string('format')
        ])
        // @ts-ignore TS6133 testing the type checker
        let as: ActualTypes<RepositoriesParams> = [7, 'foo', 'bar', 'hello']

        let repositoriesResult: Realize<typeof repositories.field.fields> = {
            nodes: [{
                id: 'fuhtnesuoehtnueo',
                name: 'foo/bar',
            }, {
                id: 'fuhtnesuoehtnueo',
                name: 'foo/bar',
            }],
            pageInfo: {
                endCursor: 'adam',
            },
        }
        repositoriesResult.nodes[0].id = 'true'
        repositoriesResult.pageInfo.endCursor += ', madam'
    })
})
