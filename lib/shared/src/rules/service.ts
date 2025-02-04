import { type Observable, map } from 'observable-fns'
import type { URI } from 'vscode-uri'
import { combineLatest, switchMap } from '..'
import { RULE_EDITING_HELPER_RULE } from './editing-helpers'
import { type FileInfoForRuleApplication, ruleAppliesToFile } from './filters'
import type { Rule } from './rules'

/**
 * A provider for discovering the rules that may apply to files. The ultimate {@link RuleService}
 * created by {@link createRuleService} calls one or more {@link RuleProvider}s to obtain the
 * candidate rules, and then applies the rules' filters and can perform other evaluations to see
 * which ones *actually* apply.
 */
export interface RuleProvider {
    /**
     * Observe the rules that may apply to at least one of the given files.
     *
     * It returns all rules found for all paths. The rules for a path are all
     * `.sourcegraph/*.rule.md` files from the file's directory or its ancestor directories.
     *
     * Implementations SHOULD NOT apply the rules' filters; that is handled later.
     */
    candidateRulesForPaths(files: URI[]): Observable<CandidateRule[]>
}

/**
 * A rule discovered by a {@link RuleProvider}, plus the files it may apply to.
 */
export interface CandidateRule {
    rule: Rule

    /**
     * The files passed to {@link RuleProvider.candidateRulesForPaths} that this rule applies to
     * based on its path.
     */
    appliesToFiles: URI[]
}

/**
 * A service for getting the set of {@link Rule}s to apply to file paths.
 *
 * It calls one or more {@link RuleProvider}s to obtain the candidate rules, and then applies the
 * rules' filters and maybe other evaluations to see which rules *actually* apply.
 */
export interface RuleService {
    /**
     * Observe the rules that apply to at least one of the given files.
     */
    rulesForPaths(files: URI[]): Observable<Rule[]>
}

/**
 * Create a {@link RuleService} that combines the results of the given rule discovery {@link providers}.
 */
export function createRuleService(
    providers: Observable<RuleProvider[]>,
    {
        fileInfo,
    }: {
        fileInfo: (file: URI) => FileInfoForRuleApplication
    }
): RuleService {
    return {
        rulesForPaths: files =>
            providers.pipe(
                switchMap(providers =>
                    combineLatest(...providers.map(s => s.candidateRulesForPaths(files))).pipe(
                        map(rules_ => {
                            const rules = rules_.flat()
                            rules.push(...BUILTIN_RULES.map(rule => ({ rule, appliesToFiles: files })))

                            const requestedFiles = new Set<string>(files.map(f => f.toString()))
                            const fileInfos = new Map<string /* URI */, FileInfoForRuleApplication>()
                            for (const uri of rules.flatMap(({ appliesToFiles }) => appliesToFiles)) {
                                if (!requestedFiles.has(uri.toString())) {
                                    // Ignore files that were not passed in the `rulesForPaths` `files` arg.
                                    continue
                                }
                                fileInfos.set(uri.toString(), fileInfo(uri))
                            }
                            function ruleAppliesToFiles(rule: Rule, files: URI[]): boolean {
                                return files.some(file => {
                                    // All files should be in `fileInfos`, but be defensive in case a {@link
                                    // RuleProvider} returns a file in `appliesToFiles` that it shouldn't
                                    // have.
                                    const info = fileInfos.get(file.toString())
                                    return info ? ruleAppliesToFile(rule, info) : false
                                })
                            }

                            return rules
                                .filter(({ rule, appliesToFiles }) =>
                                    ruleAppliesToFiles(rule, appliesToFiles)
                                )
                                .map(({ rule }) => rule)
                        })
                    )
                )
            ),
    }
}

/**
 * Builtin rules, which are always included and MUST only be used for Sourcegraph functionality
 * (such as when editing rule files for use in Sourcegraph), not for giving guidance on users' own
 * codebases.
 */
const BUILTIN_RULES: Rule[] = [RULE_EDITING_HELPER_RULE]
