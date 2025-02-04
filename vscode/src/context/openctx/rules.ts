import type { Item } from '@openctx/client'
import {
    RULES_PROVIDER_URI,
    type Rule,
    firstValueFrom,
    pluralize,
    ruleTitle,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { ruleService } from '../../rules/service'
import type { OpenCtxProvider } from './types'

/**
 * An OpenCtx provider that attaches rules for the current file.
 *
 * TODO(sqs): Should include rules that apply to @-mentioned files, but there is no current way to
 * read the list of @-mentions in the `mentions` or `items` methods.
 */
export function createRulesProvider(): OpenCtxProvider {
    return {
        providerUri: RULES_PROVIDER_URI,

        meta() {
            return {
                name: 'Rules',
                mentions: { autoInclude: true },
            }
        },

        async mentions({ autoInclude, uri }) {
            if (!autoInclude) {
                return []
            }

            // If there is no active file (which is always the case in Cody Web), then use the first
            // workspace repo root URI.
            let fileOrWorkspaceRoot: URI | undefined
            if (uri) {
                fileOrWorkspaceRoot = URI.parse(uri)
            } else {
                const firstRoot = vscode.workspace.workspaceFolders?.at(0)?.uri
                if (firstRoot) {
                    fileOrWorkspaceRoot = firstRoot
                }
            }
            if (!fileOrWorkspaceRoot) {
                return []
            }

            const rules = await firstValueFrom(ruleService.rulesForPaths([fileOrWorkspaceRoot]))
            return rules.length === 0
                ? []
                : [
                      {
                          title: `${rules.length} ${pluralize('rule', rules.length)}`,
                          description: rules.map(r => ruleTitle(r)).join('\n'),
                          uri: 'rules+openctx://rules', // dummy URI
                          data: { rules: rules satisfies Rule[] },
                      },
                  ]
        },

        async items(params) {
            const rules = params.mention?.data?.rules as Rule[] | undefined
            return (
                rules?.map(
                    rule =>
                        ({
                            url: rule.uri,
                            title: rule.title ?? rule.display_name,
                            ai: { content: rule.instruction ?? undefined },
                        }) satisfies Item
                ) ?? []
            )
        },
    }
}
