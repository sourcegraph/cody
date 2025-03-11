import { describe, expect, test } from 'vitest'
import {
    type ActualTypes,
    type Arguments,
    type Realize,
    type RealizeField,
    args,
    array,
    both,
    collectFormalList,
    collectFormals,
    constant,
    formal,
    labeled,
    nested,
    prepare,
    q,
    versionGte,
} from './dsl'

describe('GraphQL DSL', () => {
    test('top-level arguments appear in formals', () => {
        let test = args(nested('foo', q.string('baz')), formal.int('bar'))
        let fs: Arguments<typeof test> = collectFormals(test) // [formal.int('bar')]
        expect(fs).toEqual([formal.int('bar')])
        let as: ActualTypes<Arguments<typeof test>> = [7]
        let result: Realize<typeof test.field.fields> = {
            baz: 'hello',
        }
        // suppress warning about unused results
        expect([as, result])
    })

    test('nested arguments appear in formals', () => {
        let test = nested('foo', nested('bar', args(q.string('baz'), formal.int('bar'))))
        let fs: Arguments<typeof test> = collectFormals(test)
        expect(fs).toEqual([formal.int('bar')])
        let as: ActualTypes<Arguments<typeof test>> = [7]
        let result: Realize<typeof test.fields> = {
            bar: { baz: 'hello' },
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect([as, result])
    })

    test('labels obliterate the intrinsic field name', () => {
        let test = nested('foo', labeled('qux', nested('bar', q.boolean('baz'))))
        let fs: Arguments<typeof test> = collectFormals(test)
        expect(fs).toEqual([])
        let as: ActualTypes<Arguments<typeof test>> = []
        let result: Realize<typeof test.fields> = {
            // Note, this field is the renamed qux and not bar.
            qux: { baz: false },
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect([as, result])
    })

    test('constants can be mixed with variable arguments and primitive fields', () => {
        let test = args(
            q.boolean('foo'),
            constant('bar', 7),
            formal.nullableString('baz'),
            constant('qux', false),
            formal.int('quux')
        )
        let fs: Arguments<typeof test> = collectFormals(test)
        expect(fs.length).toEqual(2)
        let as: ActualTypes<Arguments<typeof test>> = ['hello, world', 42]
        let result: Realize<(typeof test)[]> = {
            foo: true,
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect([as, result])
        expect(prepare('0.0.0', test).text).toEqual(
            'query($baz0:String,$quux1:Int!,){foo(bar:7,baz:$baz0,qux:false,quux:$quux1,)}'
        )
    })

    test('constants can be mixed with variable arguments and nested fields', () => {
        let test = args(
            nested('foo', q.boolean('foobar')),
            constant('bar', 7),
            formal.nullableString('baz'),
            constant('qux', false),
            formal.int('quux')
        )
        let fs: Arguments<typeof test> = collectFormals(test)
        expect(fs.length).toEqual(2)
        let as: ActualTypes<Arguments<typeof test>> = ['hello, world', 42]
        let result: Realize<(typeof test)[]> = {
            foo: { foobar: true },
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect([as, result])
        expect(prepare('0.0.0', test).text).toEqual(
            'query($baz0:String,$quux1:Int!,){foo(bar:7,baz:$baz0,qux:false,quux:$quux1,){foobar,}}'
        )
    })

    test('arguments can be nested', () => {
        let test = args(
            array('foo', args(q.string('bar'), constant('b', false), formal.nullableString('a'))),
            formal.int('a'),
            formal.int('b')
        )
        let fs: Arguments<typeof test> = collectFormals(test)
        expect(fs.length).toEqual(3)
        let as: ActualTypes<Arguments<typeof test>> = [7, 42, 'baz']
        let result: Realize<(typeof test)[]> = {
            foo: [{ bar: 'hello' }, { bar: 'world' }],
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect([as, result])
        expect(prepare('0.0.0', test).text).toEqual(
            'query($a0:Int!,$b1:Int!,$a2:String,){foo(a:$a0,b:$b1,){bar(b:false,a:$a2,),}}'
        )
    })

    test('string constants are quoted', () => {
        let test = args(q.string('foo'), constant('bar', 'hello, "world!"'))
        expect(prepare('0.0.0', test).text).toEqual('query(){foo(bar:"hello, \\"world!\\"",)}')
    })

    test('queries can be combined', () => {
        let repositories = args(
            array('repositories', q.string('id'), q.string('name')),
            formal.int('first'),
            formal.nullableString('after'),
            formal.nullableString('query')
        )
        let userInfo = nested('currentUser', q.string('id'), q.boolean('siteAdmin'))
        let merged = both(repositories, userInfo)
        expect(collectFormalList(merged)).toEqual([
            formal.int('first'),
            formal.nullableString('after'),
            formal.nullableString('query'),
        ])
        let result: Realize<typeof merged> = {
            repositories: [
                { id: 'foo', name: 'bar' },
                { id: 'baz', name: 'quux' },
            ],
            currentUser: {
                id: 'bob',
                siteAdmin: true,
            },
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect(result)
    })

    test('fields can be predicated on the site version', () => {
        let versionQuery = versionGte(
            '5.11.0',
            { nodes: [] },
            args(
                nested('promptTags', array('nodes', q.string('id'), q.string('name'))),
                constant('first', 999)
            )
        )
        const r = prepare('5.11.0', versionQuery)
        expect(r.text).toBe('query(){promptTags(first:999,){nodes{id,name,},}}')
        expect(r.defaults).toStrictEqual({})
        const p = prepare('5.10.0', versionQuery)
        expect(p.text).toBeNull()
        const result: Realize<typeof p.query> = { promptTags: { nodes: [{ id: 'foo', name: 'bar' }] } }
        // Suppress warning about unused variables; we are testing the type checker.
        expect(result)
        expect(p.defaults).toEqual({ promptTags: { nodes: [] } })
    })

    test('repository query', () => {
        let repositories = args(
            nested(
                'repositories',
                array('nodes', q.string('id'), q.string('name')),
                nested('pageInfo', args(q.string('endCursor'), formal.nullableString('format')))
            ),
            formal.int('first'),
            formal.nullableString('after'),
            formal.nullableString('query')
        )

        type RepositoriesParams = Arguments<typeof repositories>
        let fs: RepositoriesParams = collectFormals(repositories)
        expect(fs).toEqual([
            formal.int('first'),
            formal.nullableString('after'),
            formal.nullableString('query'),
            formal.nullableString('format'),
        ])
        let as: ActualTypes<RepositoriesParams> = [7, 'foo', 'bar', 'hello']
        // Suppress warning about unused variables; we are testing the type checker.
        expect(as)

        let repositoriesResult: RealizeField<typeof repositories> = {
            nodes: [
                {
                    id: 'fuhtnesuoehtnueo',
                    name: 'foo/bar',
                },
                {
                    id: 'fuhtnesuoehtnueo',
                    name: 'foo/bar',
                },
            ],
            pageInfo: {
                endCursor: 'adam',
            },
        }
        repositoriesResult.nodes[0].id = 'true'
        repositoriesResult.pageInfo.endCursor += ', madam'
    })
})
