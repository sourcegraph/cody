import {
    type AutoEditsModelConfig,
    type AutoEditsTokenLimit,
    currentResolvedConfig,
    dotcomTokenToGatewayToken,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { RetrieverIdentifier } from '../completions/context/utils'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { lines } from '../completions/text-processing'
import { getConfiguration } from '../configuration'
import { getLineLevelDiff } from './diff-utils'
import { autoeditsLogger } from './logger'
import type { PromptProvider } from './prompt-provider'
import type { CodeToReplaceData } from './prompt-utils'
import { CodyGatewayPromptProvider } from './providers/cody-gateway'
import { FireworksPromptProvider } from './providers/fireworks'
import { OpenAIPromptProvider } from './providers/openai'
import { AutoEditsRendererManager } from './renderer'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'
const DEFAULT_DEBOUNCE_INTERVAL_MS = 150

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
}

export interface AutoeditsPrediction {
    codeToReplaceData: CodeToReplaceData
    prediction: string
}

interface ProviderConfig {
    experimentalAutoeditsConfigOverride: AutoEditsModelConfig | undefined
    providerName: AutoEditsModelConfig['provider']
    provider: PromptProvider
    model: string
    url: string
    tokenLimit: AutoEditsTokenLimit
}

/**
 * Provides inline completions and auto-edits functionality.
 */
export class AutoeditsProvider implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private readonly contextMixer: ContextMixer
    private readonly rendererManager: AutoEditsRendererManager
    private readonly debounceIntervalMs: number
    private readonly config: ProviderConfig


    constructor() {
        this.contextMixer = new ContextMixer({
            strategyFactory: new DefaultContextStrategyFactory(
                Observable.of(AUTOEDITS_CONTEXT_STRATEGY)
            ),
            dataCollectionEnabled: false,
        })
        this.rendererManager = new AutoEditsRendererManager()
        this.debounceIntervalMs = DEFAULT_DEBOUNCE_INTERVAL_MS
        this.config = this.initializeConfig()

        const handleSelectionChange = (editor: vscode.TextEditor) => {
            this.provideAutoeditsItems(editor.document, editor.selection.active)
        }

        const onSelectionChange = debounce((event: vscode.TextEditorSelectionChangeEvent) => {
            if (event.textEditor) {
                handleSelectionChange(event.textEditor)
            }
        }, this.debounceIntervalMs)

        this.disposables.push(
            this.contextMixer,
            this.rendererManager,
            vscode.commands.registerCommand('cody.experimental.suggest', () => {
                const editor = vscode.window.activeTextEditor
                if (editor) {
                    handleSelectionChange(editor)
                }
            }),
            vscode.window.onDidChangeTextEditorSelection(onSelectionChange)
        )
    }

    private initializeConfig(): ProviderConfig {
        const userConfig = getConfiguration().experimentalAutoeditsConfigOverride
        const baseConfig = userConfig ?? this.getDefaultConfig()

        return {
            experimentalAutoeditsConfigOverride: userConfig,
            providerName: baseConfig.provider,
            provider: this.createPromptProvider(baseConfig.provider),
            model: baseConfig.model,
            url: baseConfig.url,
            tokenLimit: baseConfig.tokenLimit,
        }
    }

    private createPromptProvider(providerName: AutoEditsModelConfig['provider']): PromptProvider {
        switch (providerName) {
            case 'openai':
                return new OpenAIPromptProvider()
            case 'fireworks':
                return new FireworksPromptProvider()
            case 'cody-gateway-fastpath-chat':
                return new CodyGatewayPromptProvider()
            default:
                autoeditsLogger.logDebug('Config', `Provider ${providerName} not supported`)
                throw new Error(`Provider ${providerName} not supported`)
        }
    }

    public async provideAutoeditsItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<void> {
        const autoeditResponse = await this.predictAutoeditAtDocAndPosition({
            document,
            position,
        })
        if (!autoeditResponse) {
            return
        }
        const { prediction, codeToReplaceData } = autoeditResponse
        await this.handleAutoeditsDecorations(document, position, codeToReplaceData, prediction)
    }

    private async handleAutoeditsDecorations(
        document: vscode.TextDocument,
        position: vscode.Position,
        codeToReplaceData: CodeToReplaceData,
        prediction: string
    ): Promise<void> {
        const range = new vscode.Range(
            new vscode.Position(codeToReplaceData.startLine, 0),
            document.lineAt(codeToReplaceData.endLine).rangeIncludingLineBreak.end
        )
        const currentFileText = document.getText()
        const predictedFileText =
            currentFileText.slice(0, document.offsetAt(range.start)) +
            prediction +
            currentFileText.slice(document.offsetAt(range.end))
        if (this.shouldFilterAutoeditResponse(currentFileText, predictedFileText, codeToReplaceData)) {
            autoeditsLogger.logDebug(
                'Autoedits',
                'Skipping autoedit - predicted text already exists in suffix'
            )
            return
        }
        await this.rendererManager.displayProposedEdit({
            document,
            range,
            prediction,
            currentFileText,
            predictedFileText,
        })
    }

    private shouldFilterAutoeditResponse(
        currentFileText: string,
        predictedFileText: string,
        codeToReplaceData: CodeToReplaceData
    ): boolean {
        const currentFileLines = lines(currentFileText)
        const predictedFileLines = lines(predictedFileText)
        const { addedLines } = getLineLevelDiff(currentFileLines, predictedFileLines)
        if (addedLines.length === 0) {
            return false
        }
        addedLines.sort()
        const minAddedLineIndex = addedLines[0]
        const maxAddedLineIndex = addedLines[addedLines.length - 1]
        const allAddedLines = predictedFileLines.slice(minAddedLineIndex, maxAddedLineIndex + 1)
        const allAddedLinesText = allAddedLines.join('\n')

        const immediateSuffix = codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea
        if (immediateSuffix.startsWith(allAddedLinesText)) {
            return true
        }
        return false
    }

    public async predictAutoeditAtDocAndPosition(
        options: AutoEditsProviderOptions
    ): Promise<AutoeditsPrediction | null> {
        const start = Date.now()
        const prediction = await this.generatePrediction(options)
        if (!prediction) {
            return null
        }

        autoeditsLogger.logDebug(
            'Autoedits',
            '========================== Response:\n',
            JSON.stringify(prediction, null, 2),
            '\n',
            '========================== Time Taken For LLM (Msec): ',
            (Date.now() - start).toString(),
            '\n'
        )

        return prediction
    }

    private async generatePrediction(
        options: AutoEditsProviderOptions
    ): Promise<AutoeditsPrediction | null> {
        const docContext = getCurrentDocContext({
            document: options.document,
            position: options.position,
            maxPrefixLength: tokensToChars(this.config.tokenLimit.prefixTokens),
            maxSuffixLength: tokensToChars(this.config.tokenLimit.suffixTokens),
        })
        const { context } = await this.contextMixer.getContext({
            document: options.document,
            position: options.position,
            docContext,
            maxChars: 32_000,
        })

        const { codeToReplace, promptResponse: prompt } = this.config.provider.getPrompt(
            docContext,
            options.document,
            options.position,
            context,
            this.config.tokenLimit
        )
        const apiKey = await this.getApiKey()
        const response = await this.config.provider.getModelResponse(
            this.config.url,
            this.config.model,
            apiKey,
            prompt
        )
        const postProcessedResponse = this.config.provider.postProcessResponse(codeToReplace, response)

        return {
            codeToReplaceData: codeToReplace,
            prediction: postProcessedResponse,
        }
    }

    private getDefaultConfig(): Omit<AutoEditsModelConfig, 'apiKey'> {
        const defaultTokenLimit: AutoEditsTokenLimit = {
            prefixTokens: 2500,
            suffixTokens: 2500,
            maxPrefixLinesInArea: 11,
            maxSuffixLinesInArea: 4,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 2,
            contextSpecificTokenLimit: {
                [RetrieverIdentifier.RecentEditsRetriever]: 1500,
                [RetrieverIdentifier.JaccardSimilarityRetriever]: 0,
                [RetrieverIdentifier.RecentCopyRetriever]: 500,
                [RetrieverIdentifier.DiagnosticsRetriever]: 500,
                [RetrieverIdentifier.RecentViewPortRetriever]: 2500,
            },
        }
        return {
            provider: 'cody-gateway-fastpath-chat',
            model: 'cody-model-auto-edits-fireworks-default',
            url: 'https://cody-gateway.sourcegraph.com//v1/completions/fireworks',
            tokenLimit: defaultTokenLimit,
        }
    }

    private async getApiKey(): Promise<string> {
        if (this.config.providerName === 'cody-gateway-fastpath-chat') {
            const config = await currentResolvedConfig()
            const fastPathAccessToken = dotcomTokenToGatewayToken(config.auth.accessToken)
            if (!fastPathAccessToken) {
                autoeditsLogger.logError('Autoedits', 'FastPath access token is not available')
                throw new Error('FastPath access token is not available')
            }
            return fastPathAccessToken
        }
        if (this.config.experimentalAutoeditsConfigOverride?.apiKey) {
            return this.config.experimentalAutoeditsConfigOverride.apiKey
        }
        autoeditsLogger.logError('Autoedits', 'No api key provided in the config override')
        throw new Error('No api key provided in the config override')
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
