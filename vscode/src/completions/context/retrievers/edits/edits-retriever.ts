import { ps, psDedent } from '@sourcegraph/cody-shared'
import { type AutocompleteContextSnippet, PromptString } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import {
    type DiffAcrossDocuments,
    RecentEditsRetriever,
} from '../../../../supercompletions/recent-edits/recent-edits-retriever'
import { getLanguageConfig } from '../../../../tree-sitter/language'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { shouldBeUsedAsContext } from '../../utils'

export class EditsRetriever implements ContextRetriever {
    private recentEditsRetriever: RecentEditsRetriever
    public identifier = 'recent-edits'
    private disposables: vscode.Disposable[] = []

    constructor(maxAgeMs: number = 1000 * 60) {
        this.recentEditsRetriever = new RecentEditsRetriever(maxAgeMs)
        this.disposables.push(this.recentEditsRetriever)
    }

    public async retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const rawDiffs = await this.recentEditsRetriever.getDiffAcrossDocuments()
        const diffs = this.filterCandidateDiffs(rawDiffs, options.document)
        diffs.sort((a, b) => b.latestChangeTimestamp - a.latestChangeTimestamp)

        const autocompleteContextSnippets = []
        for (const diff of diffs) {
            const content = this.getCommentedPromptForCompletions(
                diff.languageId,
                diff.uri,
                diff.diff
            ).toString()
            const autocompleteSnippet = {
                uri: diff.uri,
                content,
            } satisfies Omit<AutocompleteContextSnippet, 'startLine' | 'endLine'>
            autocompleteContextSnippets.push(autocompleteSnippet)
        }
        // TODO: add `startLine` and `endLine` to `responses` or explicitly add
        // remove the startLine and endLine from the response similar to how we do
        // for BFG.
        // @ts-ignore
        return autocompleteContextSnippets.slice(1)
    }

    public getCommentedPromptForCompletions(
        languageId: string,
        filename: vscode.Uri,
        diff: PromptString
    ): PromptString {
        const filePath = PromptString.fromDisplayPath(filename)
        const languageConfig = getLanguageConfig(languageId)
        const commentStart = languageConfig ? languageConfig.commentStart : ps`// `
        const prompt = psDedent`${commentStart} Here is git diff of the recent change made to the file ${filePath} which is used to provide context for the completion:\n${diff}`
        return prompt
    }

    public filterCandidateDiffs(
        allDiffs: DiffAcrossDocuments[],
        document: vscode.TextDocument
    ): DiffAcrossDocuments[] {
        const filterCandidateDiffs: DiffAcrossDocuments[] = []
        for (const diff of allDiffs) {
            const currentDocumentLanguageId = document.languageId
            if (shouldBeUsedAsContext(false, currentDocumentLanguageId, diff.languageId)) {
                filterCandidateDiffs.push(diff)
            }
        }
        return filterCandidateDiffs
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
