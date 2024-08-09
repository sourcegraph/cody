import { DEFAULT_EVENT_SOURCE, ModelUsage, ModelsService } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import type { VSCodeEditor } from '../editor/vscode-editor'
import type { AuthProvider } from '../services/AuthProvider'
import { type LintRule, type LintService, lintRulesFromCodylintFile } from './LintService'
import { type LintInput, getInput } from './options/menu'
// Handles invoking the fuzzy lints between specified diff-points
// and invoking ways to provide results to the user (comments, squiggles, etc).
// todo add a panel

//TODO: How do we type this
interface CommandOptions {
    targetFiles: string[]
    lintFiles: string[]
    model: string
}

export class LintController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private commentController = vscode.comments.createCommentController('cody.lint', 'Cody Lint')
    private diagnosticCollection = vscode.languages.createDiagnosticCollection('sourcegraph.cody-ai')

    private previousInput?: LintInput
    constructor(
        private lintService: LintService,
        private authProvider: AuthProvider,
        private editor: VSCodeEditor
    ) {
        this.disposables.push(this.commentController, this.diagnosticCollection)

        vscode.commands.registerCommand('cody.lint.init', async (options?: CommandOptions) => {
            let input: LintInput | undefined = undefined
            if (options) {
                let model = ModelsService.getDefaultChatModel()!
                if (options.model) {
                    const optionsModel = ModelsService.getModelByID(options.model)
                    if (!optionsModel || !optionsModel.usage.includes(ModelUsage.Chat)) {
                        throw new Error(`Invalid model ${options.model}`)
                    }
                    model = optionsModel.model
                }

                input = {
                    model,
                    targetFiles: options.targetFiles.map(file => vscode.Uri.parse(file)),
                    lintFiles: options.lintFiles.map(file => vscode.Uri.parse(file)),
                }
            }

            const res = await this.run(input)
            const output: Array<{ uri: URI; diagnostics: vscode.Diagnostic[] }> = []
            res?.forEach((uri, diagnostics) => {
                output.push({
                    uri,
                    diagnostics: [...diagnostics],
                })
            })
            return output
        })
    }

    async run(presetInput?: LintInput) {
        //TODO: Allow user to pick git-diff CODY-3106

        const input =
            presetInput ??
            (await getInput(
                this.editor,
                this.authProvider,
                {
                    initialModel: this.previousInput?.model ?? ModelsService.getDefaultChatModel()!,
                    initialLintFiles: this.previousInput?.lintFiles ?? [],
                    initialTarget:
                        this.previousInput?.targetCommitHash ?? this.previousInput?.targetFiles ?? [],
                },
                DEFAULT_EVENT_SOURCE
            ))
        if (!input) {
            return
        }
        this.previousInput = input

        const lintFiles = await Promise.all(
            input.lintFiles.map(file =>
                vscode.workspace.fs.readFile(file).then(
                    buf => ({ file, content: new TextDecoder('utf-8').decode(buf) }),
                    _ => null
                )
            )
        )
        const rules: LintRule[] = []
        for (const lintFile of lintFiles) {
            if (lintFile) {
                try {
                    rules.push(...lintRulesFromCodylintFile(lintFile))
                } catch (e) {
                    //todo: surface schema validation errors to user
                    console.error(e)
                }
            }
        }

        const entries = await this.lintService.apply(input.targetFiles, {
            model: input.model,
            rules,
        })

        // TODO: Streaming results CODY-3155

        this.diagnosticCollection.clear()
        for (const entry of entries) {
            const { file, diagnostics } = entry
            this.diagnosticCollection.set(file, diagnostics)
        }

        return this.diagnosticCollection
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
