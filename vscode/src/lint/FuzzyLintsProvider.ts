// biome-ignore lint/style/useImportType: <explanation>
import {
    ChatClient,
    ContextItem,
    ContextItemWithContent,
    Model,
    ModelTag,
    PromptString,
    getDotComDefaultModels,
    getSimplePreamble,
    ps,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { PromptBuilder } from '../prompt-builder'

// @ts-ignore
interface Lint {
    id: string
    rule: string
    title: string
    description?: string
    readMore?: URI
    quickFix?: string
    enhancedContext?:
        | {
              ruleQuery?: string
              fixQuery?: string
          }
        | string
    context?:
        | {
              rule?: URI[]
              fix?: URI[]
          }
        | URI[]
}

const lints: Record<string, { description: string }> = {
    'NAMING-0001': {
        description: `variable names must not be generic but be descriptive of their value. For example, "itemCount" is better than "i"`,
    },
    'EMOJI-0005': {
        description:
            "Longer or dense feeling comment blocks should contain at least a emoji somehwere to make the comment look more appealing and funny. It's important to keep developer morale up when reading long and important comments.",
    },
    'EMOJI-0006': {
        description:
            'Comments that warn the developer about some dangerous behaviour must always include a 🚨 emoji to draw attention.',
    },
    'FORBIDDEN-WORD-0001': {
        description: "Any mention of the word house in the meaning of 'to store' is forbidden",
    },
}

//TODO: lints on things that should be booleans but are actually arrays!
/**
 * if (ignored || limitReached) {
    return null
    }
 */

/**
 *
 * .find(code =>
                        lints[code]
                    )
 */

/**
 * Make sure that ignore comments have meaningful reason
 */

/**
 *  promptBuilder.tryAddMessages([
 *     { speaker: 'human', text: ps`execute` },
 *     {
 *         speaker: 'assistant',
 *         text: ps`Understood. Once you give me the \`execute\` command I will review the file \`@indexer/src/main.rs\` and report any issues found that are enabled in the configuration file \`@config://linter.json\`. I will take extra care to strictlly follow the response format."`,
 *     },
 *     { speaker: 'human', text: lintPrompt(targetFile, this.lintConfig) },
 * ])
 */

// Also handles things like `// cody-ignore: lint/bleh/blah: <explanation>`
export class FuzzyLintsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private mode = 'QUALITY' // Just temporary
    private model: Model =
        this.mode === 'SPEED'
            ? getDotComDefaultModels().find(model => model.tags.includes(ModelTag.Speed))!
            : getDotComDefaultModels()[0]
    private lintConfig: ContextItemWithContent = {
        uri: URI.parse('config://linter.json'),
        type: 'file',
        content: JSON.stringify(lints, null, 2),
    }
    constructor(private readonly chatClient: ChatClient) {
        // Register commands
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    async apply(files: vscode.Uri[]) {
        if (files.length === 0) {
            return []
        }

        const { model, contextWindow } = this.model

        let processedFiles = 0
        const responses = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: 'Running Pre-R Checks...',
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
                                    text: ps`Understood. Once you give me the \`execute\` command I will review the file \`@indexer/src/main.rs\` and report any issues found that are enabled in the configuration file \`@config://linter.json\`. I will take extra care to strictlly follow the response format."`,
                                },
                                { speaker: 'human', text: lintPrompt(targetFile, this.lintConfig) },
                            ])
                            const { ignored, limitReached } = await promptBuilder.tryAddContext('user', [
                                targetFile,
                                this.lintConfig,
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
                                message: `Processed ${processedFiles} of ${files.length} files`,
                                increment: processedFiles / files.length,
                            })
                        }

                        // return executeChat({
                        //     submitType: 'user',
                        //     text: lintPrompt(targetFile, config),
                        //     source: 'fuzzy-linter',
                        //     addEnhancedContext: true,
                        //     contextFiles: [config],
                        // })
                    })
                )

                return (await Promise.race([chatPromises, cancelPromise] as const)) ?? []
            }
        )

        return this.convertResponses(responses)
    }

    convertResponses(
        responses: ({ response: string; file: URI } | null)[]
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
                    .map(code => code.trim())
                    .find(code => lints[code])
                if (!code) {
                    continue
                }
                fileDiagnostics.push({
                    message: lints[code].description,
                    range: new vscode.Range(line, 0, line, 1000000),
                    severity: vscode.DiagnosticSeverity.Error,
                    source: 'fuzzy-linter',
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
