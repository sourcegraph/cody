/* eslint-disable no-sync */
import './mock-vscode'

import fs from 'fs'
import path from 'path'

import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { NoopEditor } from '@sourcegraph/cody-shared/src/editor'

import { CodyCompletionItemProvider } from '../../src/completions'
import { History } from '../../src/completions/history'
import { createProviderConfig } from '../../src/completions/providers/anthropic'
import { getFullConfig } from '../../src/configuration'
import { configureExternalServices } from '../../src/external-services'
import { InMemorySecretStorage } from '../../src/services/SecretStorageProvider'

import { completionsDataset, CURSOR } from './completions-dataset'
import { ENVIRONMENT_CONFIG } from './environment-config'
import { findSubstringPosition } from './utils'
import { TextDocument } from './vscode-text-document'

async function initCompletionsProvider(): Promise<CodyCompletionItemProvider> {
    const secretStorage = new InMemorySecretStorage()
    await secretStorage.store('cody.access-token', ENVIRONMENT_CONFIG.SOURCEGRAPH_ACCESS_TOKEN)

    const initialConfig = await getFullConfig(secretStorage)
    console.error('Running `initCompletionsProvider` with config:', initialConfig)

    if (!initialConfig.autocomplete) {
        throw new Error('`cody.autocomplete` is not true!')
    }

    const { completionsClient, codebaseContext } = await configureExternalServices(
        initialConfig,
        'rg',
        new NoopEditor()
    )

    const history = new History()

    const providerConfig = createProviderConfig({
        completionsClient,
        contextWindowTokens: 2048,
    })
    const completionsProvider = new CodyCompletionItemProvider({
        providerConfig,
        statusBar: {
            startLoading: () => () => {},
            dispose: () => {},
        },
        history,
        codebaseContext,
        disableTimeouts: true,
        triggerMoreEagerly: false,
        cache: undefined,
        isEmbeddingsContextEnabled: true,
    })

    return completionsProvider
}

/**
 * Converts the code sample to a format that can be used by the VSCode completions provider.
 */
function prepareTextDocument(code: string): { textDocument: TextDocument; position: vscode.Position } {
    const position = findSubstringPosition(code, CURSOR)

    if (!position) {
        throw new Error(`No caret position found! add ${CURSOR} to the code.`)
    }

    // Remove CURSOR marks from the code before processing it further.
    const completionReadyCode = code.replaceAll(CURSOR, '')
    const textDocument = new TextDocument(URI.parse('file:///example.ts'), completionReadyCode)

    return { textDocument, position }
}

interface CompletionResult {
    completions: string[]
    elapsed: number
    timestamp: string
    code: string
}

const sampleIndex = process.env.SAMPLE_INDEX ? parseInt(process.env.SAMPLE_INDEX, 10) : null
const iterationsPerCodeSample = parseInt(process.env.ITER || '1', 10)

// TODO: use VSCode mocked APIs to provide context for the completions provider
// See vscode/src/completions/context.ts:10:23
async function generateCompletionsForDataset(codeSamples: string[]): Promise<void> {
    const completionsProvider = await initCompletionsProvider()

    const timestamp = Date.now().toString()
    const results: CompletionResult[] = []
    for (const [index, code] of codeSamples.entries()) {
        if (sampleIndex !== null && sampleIndex !== index) {
            continue
        }

        const { textDocument, position } = prepareTextDocument(code)

        const codeSampleResults: CompletionResult[] = []
        for (let i = 0; i < iterationsPerCodeSample; i++) {
            const start = Date.now()
            const completionItems = await completionsProvider.provideInlineCompletionItems(textDocument, position, {
                triggerKind: 1,
                selectedCompletionInfo: undefined,
            })

            const completions = ('items' in completionItems ? completionItems.items : completionItems).map(item =>
                typeof item.insertText === 'string' ? item.insertText : ''
            )
            console.error(`#${index}@i=${i}`, completions)
            codeSampleResults.push({
                completions,
                elapsed: Date.now() - start,
                timestamp,
                code,
            })
        }
        results.push(...codeSampleResults)

        if (iterationsPerCodeSample > 1) {
            const meanElapsed =
                codeSampleResults.reduce((acc, result) => acc + result.elapsed, 0) / codeSampleResults.length
            console.error(`#${index} mean elapsed: ${Math.round(meanElapsed)}ms`)
        }
    }

    // TODO: prettfy path management
    // Save results to a JSON file in the completions-review-tool/data folder to be used by the review tool:
    // pnpm --filter @sourcegraph/completions-review-tool run dev
    fs.mkdirSync(ENVIRONMENT_CONFIG.OUTPUT_PATH, { recursive: true })
    const filename = path.join(ENVIRONMENT_CONFIG.OUTPUT_PATH, `completions-${timestamp}.json`)
    fs.writeFileSync(filename, JSON.stringify(results, null, 2))
    console.log('\n✅ Completions saved to:', filename)
}

generateCompletionsForDataset(completionsDataset).catch(console.error)
