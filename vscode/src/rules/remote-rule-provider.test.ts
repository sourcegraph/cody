import { type Rule, firstValueFrom } from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import * as repoResolver from '../repository/repo-name-resolver'
import { type RuleRetrieveResponse, createRemoteRuleProvider } from './remote-rule-provider'

describe('createRemoteRuleProvider', () => {
    const mockClient = {
        fetchHTTP: vi.fn(),
    }
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should fetch rules from remote API for workspace files', async () => {
        const testFile = URI.parse('https://example.com/a/src/test.ts')
        const mockRule: Rule = {
            uri: 'https://example.com/a/.sourcegraph/a.rule.md',
            display_name: 'a',
            instruction: 'test instruction',
        }

        vi.spyOn(repoResolver, 'getFirstRepoNameContainingUri').mockResolvedValue('example.com/a')
        vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('src/test.ts')
        mockClient.fetchHTTP.mockResolvedValue({ rules: [mockRule] } satisfies RuleRetrieveResponse)

        const rules = await firstValueFrom(
            createRemoteRuleProvider(mockClient).candidateRulesForPaths([testFile])
        )

        expect(mockClient.fetchHTTP).toHaveBeenCalledTimes(1)
        expect(mockClient.fetchHTTP).toHaveBeenCalledWith(
            'rules',
            'GET',
            expect.stringContaining('/.api/rules'),
            undefined,
            expect.any(AbortSignal)
        )
        expect(rules).toHaveLength(1)
        expect(rules[0]).toMatchObject({
            rule: mockRule,
            appliesToFiles: [testFile],
        })
    })

    it('should handle multiple files from different repos', async () => {
        const testFiles = [
            URI.parse('file:///workspace1/src/test1.ts'),
            URI.parse('file:///workspace2/src/test2.ts'),
        ]
        const mockRules: Rule[] = [
            {
                uri: 'https://example.com/repo1/.sourcegraph/a.rule.md',
                display_name: 'a',
                instruction: 'instruction 1',
            },
            {
                uri: 'https://example.com/repo2/.sourcegraph/b.rule.md',
                display_name: 'b',
                instruction: 'instruction 2',
            },
        ]

        vi.spyOn(repoResolver, 'getFirstRepoNameContainingUri').mockImplementation(uri =>
            Promise.resolve(
                uri.toString().includes('workspace1') ? 'example.com/repo1' : 'example.com/repo2'
            )
        )
        vi.spyOn(vscode.workspace, 'asRelativePath').mockImplementation(uri =>
            uri.toString().includes('workspace1') ? 'src/test1.ts' : 'src/test2.ts'
        )
        mockClient.fetchHTTP.mockImplementation(
            async (_, __, url): Promise<RuleRetrieveResponse> =>
                url.includes('repo1') ? { rules: [mockRules[0]] } : { rules: [mockRules[1]] }
        )

        const rules = await firstValueFrom(
            createRemoteRuleProvider(mockClient).candidateRulesForPaths(testFiles)
        )

        expect(rules).toHaveLength(2)
        expect(rules[0].rule).toEqual(mockRules[0])
        expect(rules[1].rule).toEqual(mockRules[1])
        expect(mockClient.fetchHTTP).toHaveBeenCalledTimes(2)
    })

    it('should ignore files without associated repos', async () => {
        vi.spyOn(repoResolver, 'getFirstRepoNameContainingUri').mockResolvedValue(undefined)

        const rules = await firstValueFrom(
            createRemoteRuleProvider(mockClient).candidateRulesForPaths([
                URI.parse('https://example.com/a/test.ts'),
            ])
        )
        expect(rules).toHaveLength(0)
        expect(mockClient.fetchHTTP).not.toHaveBeenCalled()
    })

    it('should handle API errors gracefully', async () => {
        vi.spyOn(repoResolver, 'getFirstRepoNameContainingUri').mockResolvedValue('test/repo')
        vi.spyOn(vscode.workspace, 'asRelativePath').mockReturnValue('src/test.ts')
        mockClient.fetchHTTP.mockRejectedValue(new Error('API Error'))

        const rules = await firstValueFrom(
            createRemoteRuleProvider(mockClient).candidateRulesForPaths([
                URI.parse('https://example.com/a/test.ts'),
            ])
        )
        expect(rules).toHaveLength(0)
    })
})
