import type * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type AutocompleteSymbolContextSnippet,
    type CodeCompletionsParams,
    type DocumentContext,
    type GitContext,
    type OllamaGenerateParameters,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'
import { type LanguageConfig, getLanguageConfig } from '../../tree-sitter/language'
import { getSuffixAfterFirstNewline } from '../text-processing'

export interface GetOllamaPromptParams {
    snippets: AutocompleteContextSnippet[]
    context: PromptString
    currentFileNameComment: PromptString
    isInfill: boolean

    uri: vscode.Uri
    prefix: PromptString
    suffix: PromptString

    languageId: string
}

export interface FormatIntroSnippetsParams {
    intro: PromptString[]
    languageConfig: LanguageConfig | null
}

export interface GetFireworksPromptParams {
    snippets: AutocompleteContextSnippet[]
    docContext: DocumentContext
    document: vscode.TextDocument
    promptChars: number
    gitContext?: GitContext
}

export interface FormatFireworksPromptParams {
    repoName: PromptString | undefined
    fileName: PromptString
    intro: PromptString
    prefix: PromptString
    suffix: PromptString
}

export class DefaultModel {
    public stopSequences = ['<PRE>', '<SUF>', '<MID>', ' <EOT>']

    public getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        const { context, currentFileNameComment, prefix } = promptContext
        return context.concat(currentFileNameComment, prefix)
    }

    public getOllamaRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const params = {
            stop: ['\n', ...this.stopSequences],
            temperature: 0.2,
            top_k: -1,
            top_p: -1,
            num_predict: 256,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...this.stopSequences]
        }

        return params
    }

    public getFireworksRequestParams(params: CodeCompletionsParams): CodeCompletionsParams {
        return {
            ...params,
            stopSequences: [...(params.stopSequences || []), ...this.stopSequences],
        }
    }

    protected formatIntroSnippets(params: FormatIntroSnippetsParams): PromptString {
        const { intro, languageConfig } = params

        const commentedOutSnippets = PromptString.join(intro, ps`\n\n`)
            .split('\n')
            .map(line => ps`${languageConfig ? languageConfig.commentStart : ps`// `}${line}`)

        return ps`${PromptString.join(commentedOutSnippets, ps`\n`)}\n`
    }

    public getFireworksPrompt(params: GetFireworksPromptParams): PromptString {
        const { snippets, docContext, document, promptChars, gitContext } = params
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(docContext, document.uri)

        const introSnippets = this.getDefaultIntroSnippets(document)
        let currentPrompt = ps``

        const languageConfig = getLanguageConfig(document.languageId)
        const fileName = PromptString.fromDisplayPath(document.uri)
        const repoName = gitContext
            ? PromptString.fromAutocompleteGitContext(gitContext, document.uri).repoName
            : undefined

        // We want to remove the same line suffix from a completion request since both StarCoder and Llama
        // code can't handle this correctly.
        const suffixAfterFirstNewline = getSuffixAfterFirstNewline(suffix)

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]

                if ('symbol' in snippet) {
                    introSnippets.push(symbolSnippetToPromptString(snippet))
                } else {
                    introSnippets.push(this.fileSnippetToPromptString(snippet))
                }
            }

            const intro = this.formatIntroSnippets({ intro: introSnippets, languageConfig })

            const nextPrompt = this.formatFireworksPrompt({
                fileName,
                repoName,
                intro,
                prefix,
                suffix: suffixAfterFirstNewline,
            })

            if (nextPrompt.length >= promptChars) {
                return currentPrompt
            }

            currentPrompt = nextPrompt
        }

        return currentPrompt
    }

    public postProcess(content: string): string {
        return content.replace(' <EOT>', '')
    }

    protected getDefaultIntroSnippets(document: vscode.TextDocument): PromptString[] {
        return []
    }

    protected fileSnippetToPromptString(snippet: AutocompleteContextSnippet): PromptString {
        const { uri } = snippet
        const { content } = PromptString.fromAutocompleteContextSnippet(snippet)

        const uriPromptString = PromptString.fromDisplayPath(uri)
        return ps`Here is a reference snippet of code from ${uriPromptString}:\n\n${content}`
    }

    protected formatFireworksPrompt(param: FormatFireworksPromptParams): PromptString {
        return ps`${param.intro}${param.prefix}`
    }
}

function symbolSnippetToPromptString(snippet: AutocompleteSymbolContextSnippet): PromptString {
    const { content, symbol } = PromptString.fromAutocompleteContextSnippet(snippet)
    return ps`Additional documentation for \`${symbol!}\`:\n\n${content}`
}
