import { describe, expect, test } from 'vitest'

// Test the extractRepoAndBranch function logic
function extractRepoAndBranch(input: string): [string, string | undefined] {
    // Handle case where input contains a colon (repo:directory@branch)
    const colonIndex = input.indexOf(':')
    if (colonIndex !== -1) {
        const repoPart = input.substring(0, colonIndex)
        const atIndex = repoPart.indexOf('@')
        if (atIndex !== -1) {
            return [repoPart.substring(0, atIndex), repoPart.substring(atIndex + 1)]
        }
        return [repoPart, undefined]
    }

    // Handle simple case: repo@branch or repo
    const atIndex = input.indexOf('@')
    if (atIndex !== -1) {
        return [input.substring(0, atIndex), input.substring(atIndex + 1)]
    }

    return [input, undefined]
}

describe('RemoteDirectoryProvider branch parsing', () => {
    describe('extractRepoAndBranch', () => {
        test('should extract repo name without branch', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo')
            expect(repo).toBe('test-repo')
            expect(branch).toBeUndefined()
        })

        test('should extract repo name with branch', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@feature-branch')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('feature-branch')
        })

        test('should handle repo:directory format without branch', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo:src/components')
            expect(repo).toBe('test-repo')
            expect(branch).toBeUndefined()
        })

        test('should handle repo@branch:directory format', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@dev:src/components')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('dev')
        })

        test('should handle complex branch names', () => {
            const [repo, branch] = extractRepoAndBranch('my-repo@feature/fix-123')
            expect(repo).toBe('my-repo')
            expect(branch).toBe('feature/fix-123')
        })

        test('should handle empty string', () => {
            const [repo, branch] = extractRepoAndBranch('')
            expect(repo).toBe('')
            expect(branch).toBeUndefined()
        })

        test('should handle @ at the end', () => {
            const [repo, branch] = extractRepoAndBranch('test-repo@')
            expect(repo).toBe('test-repo')
            expect(branch).toBe('')
        })
    })
})
