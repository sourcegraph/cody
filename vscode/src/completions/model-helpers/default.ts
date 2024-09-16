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

interface GetPromptParams {
    snippets: AutocompleteContextSnippet[]
    docContext: DocumentContext
    document: vscode.TextDocument
    promptChars: number
    gitContext?: GitContext
    /**
     * Used only with StarChat: only use infill if the suffix is not empty.
     */
    isInfill?: boolean
}

export interface FormatPromptParams {
    repoName: PromptString | undefined
    fileName: PromptString
    intro: PromptString
    prefix: PromptString
    suffix: PromptString
    isInfill: boolean
}

export interface GetDefaultIntroSnippetsParams {
    document: vscode.TextDocument
    isInfill: boolean
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

    public getRequestParams(params: CodeCompletionsParams): CodeCompletionsParams {
        return {
            ...params,
            stopSequences: [...(params.stopSequences || []), ...this.stopSequences],
        }
    }

    protected formatIntroSnippets(params: FormatIntroSnippetsParams): PromptString {
        const { intro, languageConfig } = params
        const commentStart = languageConfig ? languageConfig.commentStart : ps`// `

        const commentedOutSnippets = intro.map(snippet => {
            return PromptString.join(
                snippet.split('\n').map(line => ps`${commentStart}${line}`),
                ps`\n`
            )
        })

        return ps`${PromptString.join(commentedOutSnippets, ps`\n\n`)}\n\n`
    }

    public getPrompt(params: GetPromptParams): PromptString {
        const { snippets, docContext, document, promptChars, gitContext, isInfill = true } = params
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(docContext, document.uri)

        const introSnippets = this.getDefaultIntroSnippets({ document, isInfill })
        let currentPrompt = ps``

        const languageConfig = getLanguageConfig(document.languageId)
        const fileName = PromptString.fromDisplayPath(document.uri)
        const repoName = gitContext
            ? PromptString.fromAutocompleteGitContext(gitContext, document.uri).repoName
            : undefined

        // We want to remove the same line suffix from a completion request since both StarCoder and Llama
        // code can't handle this correctly.
        const suffixAfterFirstNewline = suffix

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

            const nextPrompt = this.formatPrompt({
                isInfill,
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

    protected getDefaultIntroSnippets(params: GetDefaultIntroSnippetsParams): PromptString[] {
        return []
    }

    protected fileSnippetToPromptString(snippet: AutocompleteContextSnippet): PromptString {
        const { uri } = snippet
        const { content } = PromptString.fromAutocompleteContextSnippet(snippet)

        const uriPromptString = PromptString.fromDisplayPath(uri)
        return ps`Here is a reference snippet of code from ${uriPromptString}:\n${content}`
    }

    protected formatPrompt(param: FormatPromptParams): PromptString {
        return ps`${param.intro}${param.prefix}`
    }
}

function symbolSnippetToPromptString(snippet: AutocompleteSymbolContextSnippet): PromptString {
    const { content, symbol } = PromptString.fromAutocompleteContextSnippet(snippet)
    return ps`Additional documentation for \`${symbol!}\`:\n${content}`
}
