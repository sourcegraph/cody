import { type AutocompleteContextSnippet, firstValueFrom } from '@sourcegraph/cody-shared'
import { formatRuleForPrompt } from '@sourcegraph/cody-shared/src/rules/rules'
import type { Disposable } from 'vscode'
import { URI } from 'vscode-uri'
import { ruleService } from '../../../rules/service'
import type { ContextRetriever, ContextRetrieverOptions } from '../../types'
import { RetrieverIdentifier } from '../utils'

export class RulesRetriever implements Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.RulesRetriever

    public async retrieve({ document }: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const rules = await firstValueFrom(ruleService.rulesForPaths([document.uri]))

        return rules.map(
            rule =>
                ({
                    type: 'base',
                    identifier: this.identifier,
                    content: formatRuleForPrompt(rule).toString(),
                    uri: URI.parse(rule.uri),
                }) satisfies AutocompleteContextSnippet
        )
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose() {}
}
