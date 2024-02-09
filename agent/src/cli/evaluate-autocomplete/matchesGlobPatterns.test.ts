import { describe, it, expect } from 'vitest'
import { matchesGlobPatterns } from './matchesGlobPatterns'

describe('matchesGlobPatterns', () => {
    function formatGlobs(globs: string[], kind: 'includes' | 'excludes'): string {
        if (globs.length === 0) {
            return ''
        }
        const result = '{' + globs.join(',') + '}'
        const maxExcludeWidth = 30
        const truncated = result.length < maxExcludeWidth ? result : result.slice(maxExcludeWidth)
        return ` with ${kind} ${truncated}`
    }

    function testMatches(
        include: string[],
        exclude: string[],
        value: string,
        params?: { negativeMatch: boolean }
    ): void {
        const includeFormat = formatGlobs(include, 'includes')
        const excludeFormat = formatGlobs(exclude, 'excludes')
        const not = params?.negativeMatch ? ' not' : ''
        it(`should${not} match '${value}'${includeFormat}${excludeFormat}`, () => {
            const result = matchesGlobPatterns(include, exclude, value)
            expect(result).toBe(Boolean(params?.negativeMatch))
        })
    }

    testMatches(['*.ts'], ['*.test.ts'], 'index.ts')
    testMatches(['*.ts'], ['index.*'], 'index.ts', { negativeMatch: true })

    it('should work on complex exclusions', () => {
        const includeGlobs: string[] = []
        const excludeGlobs = [
            '**/{*.env,.git/,.class,out/,dist/,build/,snap,node_modules/,__pycache__/,bin/,.bin/}**',
        ]
        const cases: {
            value: string
            expected: boolean
        }[] = [
            { value: 'index.ts', expected: true },
            { value: '.git/config', expected: false },
            { value: '.git/index', expected: false },
            { value: 'node_modules/.bin/foo', expected: false },
            { value: 'node_modules/foo', expected: false },
            { value: 'foo/bar/baz/node_modules/.bin/foo', expected: false },
            {
                value: 'node_modules/.pnpm/@grpc+proto-loader@0.7.8/node_modules/@grpc/proto-loader/LICENSE',
                expected: false,
            },
            { value: 'node_modules/.pnpm', expected: false },
        ]

        for (const { value, expected } of cases) {
            const result = matchesGlobPatterns(includeGlobs, excludeGlobs, value)
            expect(result).toBe(expected)
        }
    })

    const includeGlobs: string[] = ['ignore', '.codyignore']
    const cases: {
        value: string
        expected: boolean
    }[] = [
        { value: '.codyignore', expected: true },
        { value: '.cody/ignore', expected: true /* TODO: make this true */ },
        { value: '.git/index', expected: false },
        { value: 'node_modules/foo', expected: false },
    ]

    for (const { value, expected } of cases) {
        testMatches(includeGlobs, [], value, { negativeMatch: !expected })
    }
})
