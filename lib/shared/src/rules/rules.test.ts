import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { type Rule, parseRuleFile, ruleFileDisplayName, ruleSearchPaths } from './rules'

describe('parseRuleFile', () => {
    it('parses rule file content', () => {
        const uri = URI.parse('file:///a/b/c/.sourcegraph/foo.rule.md')
        const root = URI.parse('file:///a/b')
        const content = dedent`
        ---
        title: My rule
        description: My description
        tags: ['t1', 't2']
        lang: go
        repo_filters:
          include:
            - r1
            - r2
          exclude:
            - r3
        path_filters:
          include:
            - p1
            - p2
        text_content_filters:
          include:
            - x
        ---
        My instruction
        `

        expect(parseRuleFile(uri, root, content)).toStrictEqual<Rule>({
            uri: uri.toString(),
            display_name: 'c/foo',
            title: 'My rule',
            description: 'My description',
            instruction: 'My instruction',
            tags: ['t1', 't2'],
            language_filters: { include: ['go'] },
            repo_filters: { include: ['r1', 'r2'], exclude: ['r3'] },
            path_filters: { include: ['p1', 'p2'] },
            text_content_filters: { include: ['x'] },
        })
    })

    it('handles files with no front matter', () => {
        const uri = URI.parse('file:///a/b/.sourcegraph/foo.rule.md')
        const root = URI.parse('file:///a/b')
        const content = dedent`
        My instruction
        `

        const result = parseRuleFile(uri, root, content)

        expect(result).toStrictEqual<Rule>({
            uri: uri.toString(),
            display_name: 'foo',
            instruction: 'My instruction',
        })
    })

    it('ignores malformed front matter', () => {
        expect(
            parseRuleFile(
                URI.parse('file:///a/b/.sourcegraph/foo.rule.md'),
                URI.parse('file:///a/b'),
                dedent`
        ---
        title: My rule
        repo_filters: a
        path_filters: 2
        language_filters: ['x']
        text_content_filters: null
        ---
        My instruction
        `
            )
        ).toStrictEqual<Rule>({
            uri: 'file:///a/b/.sourcegraph/foo.rule.md',
            display_name: 'foo',
            title: 'My rule',
            instruction: 'My instruction',
        })
    })
})

describe('ruleFileDisplayName', () => {
    it('handles root dirs', () => {
        const uri = URI.parse('file:///a/b/.sourcegraph/foo.rule.md')
        const root = URI.parse('file:///a/b')
        expect(ruleFileDisplayName(uri, root)).toBe('foo')
    })

    it('handles non-root dirs', () => {
        const uri = URI.parse('file:///a/b/c/.sourcegraph/foo.rule.md')
        const root = URI.parse('file:///a/b')
        expect(ruleFileDisplayName(uri, root)).toBe('c/foo')
    })

    it('handles deeply nested non-root dirs', () => {
        const uri = URI.parse('file:///a/b/c/d/.sourcegraph/foo.rule.md')
        const root = URI.parse('file:///a/b')
        expect(ruleFileDisplayName(uri, root)).toBe('c/d/foo')
    })
})

describe('ruleSearchPaths', () => {
    it('returns search paths for .sourcegraph files', () => {
        const uri = URI.parse('file:///a/b/c/src/example.ts')
        const root = URI.parse('file:///a/b/c')
        const searchPaths = ruleSearchPaths(uri, root)
        expect(searchPaths.map(u => u.toString())).toStrictEqual([
            'file:///a/b/c/src/.sourcegraph',
            'file:///a/b/c/.sourcegraph',
        ])
    })

    it('handles root path', () => {
        const uri = URI.parse('file:///a/b/c') // is a dir not a file, but test this anyway
        const root = URI.parse('file:///a/b/c')
        const searchPaths = ruleSearchPaths(uri, root)
        expect(searchPaths.map(u => u.toString())).toStrictEqual([])
    })
})
