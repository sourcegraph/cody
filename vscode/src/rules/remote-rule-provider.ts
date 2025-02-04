import {
    type CandidateRule,
    type Rule,
    type RuleProvider,
    type SourcegraphGraphQLAPIClient,
    graphqlClient,
    isError,
    logDebug,
    promiseFactoryToObservable,
} from '@sourcegraph/cody-shared'
import type { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import { getFirstRepoNameContainingUri } from '../repository/repo-name-resolver'

/**
 * A {@link RuleProvider} that fetches rules from the Sourcegraph instance API.
 */
export function createRemoteRuleProvider(
    client: Pick<SourcegraphGraphQLAPIClient, 'fetchHTTP'> = graphqlClient
): RuleProvider {
    return {
        candidateRulesForPaths(files: URI[]): Observable<CandidateRule[]> {
            return promiseFactoryToObservable(async signal => {
                const filesByRepo = new Map<string /* repo name */, URI[]>()
                await Promise.all(
                    files.map(async uri => {
                        const repoName = await getFirstRepoNameContainingUri(uri)
                        if (!repoName) {
                            return
                        }
                        filesByRepo.set(repoName, [...(filesByRepo.get(repoName) ?? []), uri])
                    })
                )

                const candidateRules = new Map<string /* rule URI */, CandidateRule>()
                await Promise.all(
                    Array.from(filesByRepo.entries()).map(async ([repoName, files]): Promise<void> => {
                        await Promise.all(
                            files.map(async uri => {
                                // TODO(sqs): better mapping of local files to paths within a remote repo
                                const filePath = vscode.workspace.asRelativePath(uri)
                                const rules = await listRulesApplyingToRemoteFile(
                                    client,
                                    repoName,
                                    filePath,
                                    signal
                                )
                                for (const rule of rules) {
                                    let c = candidateRules.get(rule.uri)
                                    if (c) {
                                        c.appliesToFiles.push(uri)
                                    } else {
                                        c = {
                                            rule,
                                            appliesToFiles: [uri],
                                        }
                                        candidateRules.set(rule.uri, c)
                                    }
                                }
                            })
                        )
                    })
                )

                return Array.from(candidateRules.values())
            })
        },
    }
}

/**
 * @see [RuleRetrieveResponse](https://sourcegraph.sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/openapi/rule.tsp)
 */
export interface RuleRetrieveResponse {
    rules: Rule[] | null
}

async function listRulesApplyingToRemoteFile(
    client: Pick<SourcegraphGraphQLAPIClient, 'fetchHTTP'>,
    repoName: string,
    filePath: string,
    signal?: AbortSignal
): Promise<Rule[]> {
    try {
        const query = new URLSearchParams()
        query.set('filter[applies_to_repo]', repoName)
        // TODO(sqs): supply the relevant branch/rev, if any
        query.set('filter[applies_to_path]', filePath)
        const resp = await client.fetchHTTP<RuleRetrieveResponse>(
            'rules',
            'GET',
            `/.api/rules?${query.toString()}`,
            undefined,
            signal
        )
        if (isError(resp)) {
            return []
        }
        return resp.rules ?? []
    } catch (error) {
        logDebug(
            'rules',
            `Error listing rules for remote file ${filePath} in repository ${repoName}: ${error}`
        )
        return []
    }
}
