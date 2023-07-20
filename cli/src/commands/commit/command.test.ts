import { describe, expect, test, vi } from 'vitest'

import { createGitHelpers } from '../../gitHelpers'
import { withTemporaryGitRepository } from '../../gitHelpers/testHelpers'

import { run } from './command'

vi.mock('../../client/completions', () => ({
    getCompletionWithContext: () => Promise.resolve('abc</commit-message>'),
}))

describe('commit', () => {
    test('generates commit message', () =>
        withTemporaryGitRepository({
            stagedFiles: {
                'a.js': 'function getUsername() { return process.env.USER }',
            },
            run: async (gitDir: string) => {
                expect(
                    await run(
                        { otherCommits: false, dryRun: true, all: false },
                        {
                            cwd: gitDir,
                            gitHelpers: createGitHelpers(),
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                            client: {} as any,
                        },
                        { debug: false }
                    )
                ).toBe('abc')
            },
        }))
})
