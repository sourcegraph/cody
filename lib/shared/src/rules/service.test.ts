import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { mockResolvedConfig } from '../configuration/resolver'
import { firstValueFrom } from '../misc/observable'
import type { FileInfoForRuleApplication } from './filters'
import type { Rule } from './rules'
import { type CandidateRule, type RuleProvider, createRuleService } from './service'

describe('createRuleService', () => {
    const fileInfo = (uri: URI): FileInfoForRuleApplication => ({
        path: uri.path,
        languages: [],
        repo: 'my/repo',
        textContent: 'foo',
    })

    beforeEach(() => {
        mockResolvedConfig({ configuration: { rulesEnabled: true } })
    })

    it('combines rules from multiple providers and filters them', async () => {
        const rule1: Rule = {
            uri: 'file:///a/.sourcegraph/b.rule.md',
            display_name: 'b',
            title: 'Rule 1',
            path_filters: { exclude: ['\\.ts$'] },
        }
        const rule2: Rule = {
            uri: 'file:///a/b/.sourcegraph/c.rule.md',
            display_name: 'b/c',
            title: 'Rule 2',
        }

        const files = [
            URI.parse('file:///a/x.ts'),
            URI.parse('file:///a/b/y.ts'),
            URI.parse('file:///a/z.go'),
        ]
        const provider1: RuleProvider = {
            candidateRulesForPaths: () => Observable.of([{ rule: rule1, appliesToFiles: files }]),
        }
        const provider2: RuleProvider = {
            candidateRulesForPaths: () => Observable.of([{ rule: rule2, appliesToFiles: [files[1]] }]),
        }

        const service = createRuleService(Observable.of([provider1, provider2]), { fileInfo })
        expect(await firstValueFrom(service.rulesForPaths(files))).toStrictEqual([rule1, rule2])
        expect(await firstValueFrom(service.rulesForPaths([files[0], files[1]]))).toStrictEqual([rule2])
    })

    it('returns null when disabled', async () => {
        const file = URI.parse('file:///a/x.go')
        const provider1: RuleProvider = {
            candidateRulesForPaths: () =>
                Observable.of<CandidateRule[]>([
                    {
                        rule: {
                            uri: 'file:///a/.sourcegraph/b.rule.md',
                            display_name: 'b',
                        },
                        appliesToFiles: [file],
                    },
                ]),
        }

        // Make sure it returns something before we disable it, so our test is effective.
        expect(
            await firstValueFrom(
                createRuleService(Observable.of([provider1]), { fileInfo }).rulesForPaths([file])
            )
        ).toMatchObject([{ display_name: 'b' }])

        // Now disable it and ensure the result is `null`.
        mockResolvedConfig({ configuration: { rulesEnabled: false } })
        expect(
            await firstValueFrom(
                createRuleService(Observable.of([provider1]), { fileInfo }).rulesForPaths([file])
            )
        ).toBe(null)
    })
})
