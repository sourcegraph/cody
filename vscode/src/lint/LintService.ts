import {
    type ChatClient,
    type ChatModel,
    type ContextItem,
    type ContextItemWithContent,
    ModelsService,
    PromptString,
    getSimplePreamble,
    ps,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { parse } from 'yaml'
import { z } from 'zod'
import { PromptBuilder } from '../prompt-builder'
export interface LintOptions {
    rules: LintRule[]
    /** The LLM that the user has selected */
    model: ChatModel
}

//@ts-ignore
export interface LintRule {
    source?: {
        file?: URI
    }
    title: string
    description: {
        human: string
        cody?: string
    }
    readMore?: URI
}

export const codylintFileSchema = z.object({
    rules: z.array(
        z.object({
            title: z.string(),
            description: z.union([
                z.string(),
                z.object({
                    human: z.string(),
                    cody: z.string().optional(),
                }),
            ]),
            readMore: z.string().url().optional(),
        })
    ),
})

export function lintRulesFromCodylintFile(lintFile?: { file: URI; content: string }): LintRule[] {
    if (!lintFile) {
        return []
    }
    //TODO: Handle errors
    const parsedYaml = parse(lintFile.content)
    const parsedLintFile = codylintFileSchema.parse(parsedYaml)
    return parsedLintFile.rules.map(rule => {
        return {
            source: {
                file: lintFile.file,
            },
            title: rule.title,
            description: {
                human: typeof rule.description === 'string' ? rule.description : rule.description.human,
                cody: typeof rule.description === 'string' ? undefined : rule.description.cody,
            },
            readMore: rule.readMore ? URI.parse(rule.readMore) : undefined,
        } satisfies LintRule
    })
}

export class LintService implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    constructor(private readonly chatClient: ChatClient) {}

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }

    //TODO: Linting sessions CODY-3121
    async apply(files: URI[], options: LintOptions) {
        if (files.length === 0) {
            return []
        }
        const resolvedModel = ModelsService.resolveModel(options.model)
        if (!resolvedModel || !options.rules) {
            return []
        }

        const promptConfigContent = Object.fromEntries(
            options.rules.map((rule, index) => [
                `CODY-LINT-${index}`,
                { rule: rule.description.cody ?? rule.description.human },
            ])
        )
        const promptConfig: ContextItemWithContent = {
            uri: URI.parse('config://linter.json'),
            type: 'file',
            content: JSON.stringify(promptConfigContent, null, 2),
        }
        const { model, contextWindow } = resolvedModel

        let processedFiles = 0
        const responses = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: `Cody Lint: 0/${files.length}`,
                cancellable: true,
            },
            async (progress, token) => {
                const abortController = new AbortController()
                const cancelPromise: Promise<null> = new Promise(resolve => {
                    token.onCancellationRequested(() => {
                        abortController.abort()
                        resolve(null)
                    })
                })
                const chatPromises = Promise.all(
                    files.map(async file => {
                        try {
                            //TODO: Consistent buffer decoding
                            const targetFileLines = Buffer.from(await vscode.workspace.fs.readFile(file))
                                .toString('utf-8')
                                .split('\n')
                            const targetFileContentWithLines = targetFileLines
                                .map((line, index) => `${index + 1}:\t${line}`)
                                .join('\n')
                            const targetFile: ContextItemWithContent = {
                                uri: file,
                                type: 'file',
                                content: targetFileContentWithLines,
                            }

                            const promptBuilder = new PromptBuilder(contextWindow)
                            promptBuilder.tryAddToPrefix(getSimplePreamble(model, 1, PROMPT_PREFIX))
                            promptBuilder.tryAddMessages([
                                { speaker: 'human', text: ps`execute` },
                                {
                                    speaker: 'assistant',
                                    text: ps`Understood. Once you give me the \`execute\` command I will review ${PromptString.fromDisplayPath(
                                        targetFile.uri
                                    )} and report any issues found that are enabled in ${PromptString.fromDisplayPath(
                                        promptConfig.uri
                                    )}. I will take extra care to strictly follow the response format."`,
                                },
                                { speaker: 'human', text: lintPrompt(targetFile, promptConfig) },
                            ])
                            const { ignored, limitReached } = await promptBuilder.tryAddContext('user', [
                                targetFile,
                                promptConfig,
                            ])
                            if (ignored.length || limitReached) {
                                return null
                            }

                            // const newEnhancedContextItems = await getEnhancedContext()
                            // await promptBuilder.tryAddContext('enhanced', [])

                            const prompt = await promptBuilder.build()

                            const responseStream = this.chatClient.chat(
                                prompt,
                                { model, maxTokensToSample: contextWindow.output },
                                abortController.signal
                            )

                            let response = ''
                            for await (const message of responseStream) {
                                if (abortController.signal.aborted) {
                                    return null
                                }
                                switch (message.type) {
                                    case 'change':
                                        response = message.text
                                        break
                                    case 'error':
                                        return null
                                }
                            }

                            if (!response) {
                                return null
                            }

                            return {
                                response,
                                file,
                            }
                        } catch (error) {
                            console.error(error)
                            vscode.window.showErrorMessage((error as any).message)
                            return null
                        } finally {
                            processedFiles++
                            progress.report({
                                message: `Cody Lint: ${processedFiles}/${files.length}`,
                                increment: processedFiles / files.length,
                            })
                        }
                    })
                )

                return (await Promise.race([chatPromises, cancelPromise] as const)) ?? []
            }
        )

        return this.convertResponses(responses, options.rules)
    }

    convertResponses(
        responses: ({ response: string; file: URI } | null)[],
        rules: LintRule[]
    ): { diagnostics: vscode.Diagnostic[]; file: URI }[] {
        const diagnostics = []
        for (const entry of responses) {
            const fileDiagnostics: vscode.Diagnostic[] = []
            if (!entry || entry.response === '✅') {
                continue
            }

            const errorBlockMatch = entry.response.match(/<errors>(.*)<\/errors>/s)
            if (!errorBlockMatch) {
                continue
            }

            const errorsMatch = /(?<line>\d+): (?<codes>.+)/g
            const lineMatches = errorBlockMatch[1].matchAll(errorsMatch)
            for (const lineMatch of lineMatches) {
                const line = Number.parseInt(lineMatch.groups!.line, 10) - 1 // Convert to 0-based index
                const code = lineMatch
                    .groups!.codes.split(',')
                    .map(code => Number.parseInt(code.trim().substring('CODY-LINT-'.length)))[0]
                const rule = rules[code]
                fileDiagnostics.push({
                    code: `${code}`,
                    message: `Cody Lint: ${rule.title.trim()}`,
                    relatedInformation: [],
                    range: new vscode.Range(line, 0, line, 1000000),
                    severity: vscode.DiagnosticSeverity.Error,
                    source: 'funny.codylint.yaml', // TODO: keep track of which file they came from
                })
            }
            diagnostics.push({
                diagnostics: fileDiagnostics,
                file: entry.file,
            })
        }

        return diagnostics
    }
}

const PROMPT_PREFIX = ps`
You are a AI code-linter tasked with identifying specific issues in a file.

You must follow the instructions exactly.
`.trim()

function lintPrompt(targetFile: ContextItem, config: ContextItem): PromptString {
    return ps`
You must only look for issue inside of @${PromptString.fromDisplayPath(targetFile.uri)}.
You must only look for issues that are enabled in your configuration file @${PromptString.fromDisplayPath(
        config.uri
    )}

All other files are just for context and must only be used for reference.

If no issues are found in @${PromptString.fromDisplayPath(targetFile.uri)} you must respond only with a ✅.

If there are issues in @${PromptString.fromDisplayPath(targetFile.uri)} you must respond first with a ❌ and then with a <errors> list.

The <errors> list must be in the following format:
- The list must begin with <errors> and end with </errors>.
- Each line must start with the line number followed by a colon and the issue code. The issue code is defined in your configuration file @cody.linter.yaml.
- If there are multiple issues on a single line, you can list them all on the same line separated by a comma.
- If a error spans multiple lines you only need to output the first line.
- Lines do not need to be in order.

No other output is allowed as your output is directly piped into another application.

Below is an example of valid output:
\`\`\'
❌
<errors>
127: E0001, E0002
235: E0005
10: F0006
</errors>
\`\`\`
`.trim()
}
