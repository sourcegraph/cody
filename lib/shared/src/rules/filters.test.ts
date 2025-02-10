import { describe, expect, it } from 'vitest'
import { ruleAppliesToFile } from './filters'

describe('ruleAppliesToFile', () => {
    const testFile: Parameters<typeof ruleAppliesToFile>[1] = {
        repo: 'github.com/sourcegraph/sourcegraph',
        path: 'lib/shared/src/example.ts',
        languages: ['typescript'],
        textContent: 'const x = 1',
    }

    it('returns true when no filters are specified', () => {
        expect(ruleAppliesToFile({}, testFile)).toBe(true)
    })

    it('matches repo filters', () => {
        expect(
            ruleAppliesToFile(
                {
                    repo_filters: {
                        include: ['github.com/sourcegraph/.*'],
                        exclude: ['github.com/sourcegraph/other'],
                    },
                },
                testFile
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    repo_filters: {
                        include: ['github.com/other/.*'],
                    },
                },
                testFile
            )
        ).toBe(false)
    })

    it('matches path filters', () => {
        expect(
            ruleAppliesToFile(
                {
                    path_filters: {
                        include: ['.*/src/.*\\.ts$'],
                        exclude: ['.*/test/.*'],
                    },
                },
                testFile
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    path_filters: {
                        include: ['.*/test/.*'],
                    },
                },
                testFile
            )
        ).toBe(false)
    })

    it('matches language filters', () => {
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['typescript'],
                        exclude: ['javascript'],
                    },
                },
                testFile
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['go'],
                    },
                },
                testFile
            )
        ).toBe(false)
    })

    it('matches text content filters', () => {
        expect(
            ruleAppliesToFile(
                {
                    text_content_filters: {
                        include: ['const.*='],
                        exclude: ['function'],
                    },
                },
                testFile
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    text_content_filters: {
                        include: ['function'],
                    },
                },
                testFile
            )
        ).toBe(false)
    })

    it('requires all filters to match', () => {
        expect(
            ruleAppliesToFile(
                {
                    repo_filters: { include: ['github.com/sourcegraph/.*'] },
                    path_filters: { include: ['.*/src/.*\\.ts$'] },
                    language_filters: { include: ['typescript'] },
                    text_content_filters: { include: ['const.*='] },
                },
                testFile
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    repo_filters: { include: ['github.com/sourcegraph/.*'] },
                    path_filters: { include: ['.*/test/.*'] },
                },
                testFile
            )
        ).toBe(false)
    })
})
