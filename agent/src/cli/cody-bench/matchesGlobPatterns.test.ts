import { describe, expect, it } from 'vitest'
import { matchesGlobPatterns } from './matchesGlobPatterns'

describe('matchesGlobPatterns', () => {
    it('should return true when value matches include globs', () => {
        const includeGlobs = ['*.ts']
        const excludeGlobs = ['*.test.ts']
        const value = 'index.ts'

        const result = matchesGlobPatterns(includeGlobs, excludeGlobs, value)

        expect(result).toBe(true)
    })

    it('should return false when value matches exclude globs', () => {
        const includeGlobs = ['*.ts']
        const excludeGlobs = ['index.*']
        const value = 'index.ts'

        const result = matchesGlobPatterns(includeGlobs, excludeGlobs, value)

        expect(result).toBe(false)
    })

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
})
