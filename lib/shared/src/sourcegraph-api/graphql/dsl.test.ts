import {describe, expect, test} from "vitest";
import {
    type Arguments,
    type ActualTypes,
    args,
    array,
    collectFormals,
    formal,
    nested,
    q,
    type Realize,
    both, collectFormalList, type RealizeField
} from "./dsl";

describe('GraphQL DSL', () => {
    test('top-level arguments appear in formals', () => {
        let test = args(nested('foo',
            q.string('baz')
        ), formal.int('bar'));
        let fs: Arguments<typeof test> = collectFormals(test) // [formal.int('bar')]
        expect(fs).toEqual([formal.int('bar')])
        let as: ActualTypes<Arguments<typeof test>> = [7]
        let result: Realize<typeof test.field.fields> = {
            'baz': 'hello'
        };
        // suppress warning about unused results
        expect([as, result])
    })

    test('nested arguments appear in formals', () => {
        let test = nested('foo',
            nested('bar', args(q.string('baz'), formal.int('bar')))
        )
        let fs: Arguments<typeof test> = collectFormals(test)
        expect(fs).toEqual([formal.int('bar')])
        let as: ActualTypes<Arguments<typeof test>> = [7]
        let result: Realize<typeof test.fields> = {
            'bar': {'baz': 'hello'},
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect([as, result])
    })

    test('queries can be combined', () => {
        let repositories = args(
            array('repositories', q.string('id'), q.string('name')),
            formal.int('first'), formal.string('after'), formal.string('query')
        )
        let userInfo = nested('currentUser', q.string('id'), q.boolean('siteAdmin'))
        let merged = both(repositories, userInfo)
        expect(collectFormalList(merged)).toEqual([
            formal.int('first'), formal.string('after'), formal.string('query')
        ])
        let result: Realize<typeof merged> = {
            repositories: [
                { id: 'foo', name: 'bar' },
                { id: 'baz', name: 'quux' },
            ],
            currentUser: {
                id: 'bob',
                siteAdmin: true,
            }
        }
        // Suppress warning about unused variables; we are testing the type checker.
        expect(result)
    })

    test('repository query', () => {
        let repositories = args(nested('repositories',
            array('nodes',
                q.string('id'),
                q.string('name'),
            ),
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
        let as: ActualTypes<RepositoriesParams> = [7, 'foo', 'bar', 'hello']
        // Suppress warning about unused variables; we are testing the type checker.
        expect(as)

        let repositoriesResult: RealizeField<typeof repositories> = {
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
