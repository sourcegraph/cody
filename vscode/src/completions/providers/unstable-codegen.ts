import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { agent, fetch } from '../../fetch'
import { logger } from '../../log'
import { Completion, ContextSnippet } from '../types'

import { Provider, ProviderConfig, ProviderOptions } from './provider'

interface UnstableCodeGenOptions {
    serverEndpoint: string
    socksProxy?: string // If set, `serverEndpoint` is reached out to via the proxy.
}

const PROVIDER_IDENTIFIER = 'codegen'

export class UnstableCodeGenProvider extends Provider {
    private serverEndpoint: string
    private proxyAddress?: string

    constructor(options: ProviderOptions, unstableCodeGenOptions: UnstableCodeGenOptions) {
        super(options)
        this.serverEndpoint = unstableCodeGenOptions.serverEndpoint
        this.proxyAddress = unstableCodeGenOptions.socksProxy || undefined
    }

    public async generateCompletions(abortSignal: AbortSignal, snippets: ContextSnippet[]): Promise<Completion[]> {
        const { prefix, suffix } = this.options.docContext
        const suffixAfterFirstNewline = suffix.slice(suffix.indexOf('\n'))

        const params = {
            debug_ext_path: 'cody',
            lang_prefix: `<|${mapVSCodeLanguageIdToModelId(this.options.languageId)}|>`,
            prefix,
            suffix: suffixAfterFirstNewline,
            top_p: 0.95,
            temperature: 0.2,
            max_tokens: this.options.multiline ? 128 : 40,
            // The backend expects an even number of requests since it will
            // divide it into two different batches.
            batch_size: makeEven(4),
            // TODO: Figure out the exact format to attach context
            context: JSON.stringify(prepareContext(snippets, this.options.fileName)),
            completion_type: 'automatic',
        }

        const log = logger.startCompletion({
            params,
            provider: PROVIDER_IDENTIFIER,
            serverEndpoint: this.serverEndpoint,
        })
        const requestInit: RequestInit = {
            method: 'POST',
            body: JSON.stringify(params),
            headers: {
                'Content-Type': 'application/json',
                // Force HTTP connection reuse to reduce latency.
                // c.f. https://github.com/microsoft/vscode/issues/173861
                Connection: 'keep-alive',
            },
            signal: abortSignal,
        }
        const agentRequestInit =
            this.proxyAddress !== undefined && agent.current ? { agent: agent.current(new URL(this.proxyAddress)) } : {}
        const response = await fetch(this.serverEndpoint, { ...requestInit, ...agentRequestInit })
        try {
            const data = (await response.json()) as { completions: { completion: string }[] }

            const completions: string[] = data.completions.map(c => postProcess(c.completion))
            log?.onComplete(completions)

            return completions.map(content => ({ content }))
        } catch (error: any) {
            if (!isAbortError(error)) {
                log?.onError(error)
            }

            throw error
        }
    }
}

function postProcess(content: string): string {
    return content.trim()
}

// Handles some inconsistencies between the VS Code language ID and the model's
// required language identifier.
function mapVSCodeLanguageIdToModelId(languageId: string): string {
    switch (languageId) {
        case 'typescript':
        case 'typescriptreact':
            return 'typescript'
        case 'javascript':
        case 'javascriptreact':
            return 'javascript'
        case 'css':
        case 'scss':
        case 'sass':
            return 'css'
        case 'c-sharp':
            return 'csharp'
        case 'shellscript':
            return 'shell'
        default:
            return languageId
    }
}

function makeEven(number: number): number {
    if (number % 2 === 1) {
        return number + 1
    }
    return number
}

interface Context {
    current_file_path: string
    windows: {
        file_path: string
        text: string
        similarity: number
    }[]
}

function prepareContext(snippets: ContextSnippet[], fileName: string): Context {
    const windows: Context['windows'] = []

    // the model expects a similarly to rank the order and priority to insert
    // snippets. Since we already have ranked results and do not expose the
    // score, we can create an artificial score for simplicity.
    let similarity = 0.5
    for (const snippet of snippets) {
        // Slightly decrease similarity between subsequent windows
        similarity *= 0.99
        windows.push({
            file_path: snippet.fileName,
            text: snippet.content,
            similarity,
        })
    }

    return {
        current_file_path: fileName,
        windows,
    }
}

export function createProviderConfig(unstableCodeGenOptions: UnstableCodeGenOptions): ProviderConfig {
    const contextWindowChars = 8_000 // ~ 2k token limit
    return {
        create(options: ProviderOptions) {
            return new UnstableCodeGenProvider(options, unstableCodeGenOptions)
        },
        maximumContextCharacters: contextWindowChars,
        enableExtendedMultilineTriggers: false,
        identifier: PROVIDER_IDENTIFIER,
        model: 'codegen',
    }
}
