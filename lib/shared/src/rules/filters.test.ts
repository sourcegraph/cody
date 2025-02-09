import { describe, expect, it } from 'vitest'
import { ruleAppliesToFile } from './filters'

describe('ruleAppliesToFile', () => {
    const testFile1: Parameters<typeof ruleAppliesToFile>[1] = {
        repo: 'github.com/sourcegraph/sourcegraph',
        path: 'lib/shared/src/example.ts',
        languages: ['TypeScript'],
        textContent: 'const x = 1',
    }
    const testFile2: Parameters<typeof ruleAppliesToFile>[1] = {
        repo: 'github.com/sourcegraph/sourcegraph',
        path: 'lib/shared/src/example.cpp',
        languages: ['C++'],
        textContent: 'int main() { return 0; }',
    }
    const testFile3: Parameters<typeof ruleAppliesToFile>[1] = {
        repo: 'github.com/sourcegraph/sourcegraph',
        path: 'lib/shared/src/example.c',
        languages: ['C'],
        textContent: 'int main() { return 0; }',
    }
    const testFile4: Parameters<typeof ruleAppliesToFile>[1] = {
        repo: 'github.com/sourcegraph/sourcegraph',
        path: 'lib/shared/src/Example.java',
        languages: ['Java'],
        textContent: 'public class Example { public static void main(String[] args) { } }',
    }

    it('returns true when no filters are specified', () => {
        expect(ruleAppliesToFile({}, testFile1)).toBe(true)
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
                testFile1
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    repo_filters: {
                        include: ['github.com/other/.*'],
                    },
                },
                testFile1
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
                testFile1
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    path_filters: {
                        include: ['.*/test/.*'],
                    },
                },
                testFile1
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
                testFile1
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['go'],
                    },
                },
                testFile1
            )
        ).toBe(false)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['c++'], // Ensure languages with special chars (C++) can still match
                    },
                },
                testFile2
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['c'], // Ensure a filter for C files doesn't match C++ files (no substring match)
                    },
                },
                testFile2
            )
        ).toBe(false)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['c'],
                    },
                },
                testFile3
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['c++'],
                    },
                },
                testFile3
            )
        ).toBe(false)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['csharp'],
                    },
                },
                testFile3
            )
        ).toBe(false)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['java'],
                    },
                },
                testFile4
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    language_filters: {
                        include: ['javascript'],
                    },
                },
                testFile4
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
                testFile1
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    text_content_filters: {
                        include: ['function'],
                    },
                },
                testFile1
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
                testFile1
            )
        ).toBe(true)
        expect(
            ruleAppliesToFile(
                {
                    repo_filters: { include: ['github.com/sourcegraph/.*'] },
                    path_filters: { include: ['.*/test/.*'] },
                },
                testFile1
            )
        ).toBe(false)
    })
})
