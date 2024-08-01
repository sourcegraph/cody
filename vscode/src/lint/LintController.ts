import { DEFAULT_EVENT_SOURCE, ModelsService } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { VSCodeEditor } from '../editor/vscode-editor'
import type { AuthProvider } from '../services/AuthProvider'
import { type LintService, lintRulesFromCodylintFile } from './LintService'
import { type LintInput, getInput } from './options/menu'
// Handles invoking the fuzzy lints between specified diff-points
// and invoking ways to provide results to the user (comments, squiggles, etc).
// todo add a panel

export class LintController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private commentController = vscode.comments.createCommentController('cody.pre-r', 'Cody Pre-R')
    private diagnosticCollection = vscode.languages.createDiagnosticCollection('sourcegraph.cody-ai')

    private previousInput?: LintInput
    constructor(
        private lintService: LintService,
        private authProvider: AuthProvider,
        private editor: VSCodeEditor
    ) {
        this.disposables.push(this.commentController, this.diagnosticCollection)

        vscode.commands.registerCommand('cody.lint.init', () => this.run())
        // vscode.commands.registerCommand('cody.pre-r.clean', () => {
        //     this.run(true)
        // })
    }

    async run() {
        // // we now ask if the user wants to run on some selection of open files
        // // or if they want to run on a git diff
        // const gitDiffOption: vscode.QuickPickItem = { label: 'Git diff' }
        // const openFilesOptions = vscode.window.tabGroups.all
        //     .flatMap(group => group.tabs)
        //     .filter(tab => tab.input instanceof vscode.TabInputText)
        //     .map(tab => ({
        //         label: vscode.workspace.asRelativePath((tab.input as vscode.TabInputText).uri),
        //         description: (tab.input as vscode.TabInputText).uri.path,
        //     }))
        // const gitDiffs: vscode.QuickPickItem[] =
        // TODO: invoke something on the FuzzyLintsProvider
        // TODO: invoke something on the DiagnosticsController to get them registered?
        // await this.addComments()

        const input = await getInput(
            this.editor,
            this.authProvider,
            {
                initialModel: this.previousInput?.model ?? ModelsService.getDefaultChatModel()!,
                initialLintFiles: this.previousInput?.lintFiles ?? [],
                initialTarget:
                    this.previousInput?.targetCommitHash ?? this.previousInput?.targetFiles ?? [],
            },
            DEFAULT_EVENT_SOURCE
        )
        if (!input) {
            return
        }
        this.previousInput = input

        // const files = input.targetFiles.map(file => file.uri!).filter(Boolean)

        const codylintFileContents = (
            await Promise.all(
                input.lintFiles.map(file =>
                    vscode.workspace.fs.readFile(file).then(
                        buf => buf.toString(),
                        _ => null
                    )
                )
            )
        ).filter(Boolean) as string[]
        const rules = codylintFileContents.filter(Boolean).flatMap(lintRulesFromCodylintFile)

        const entries = await this.lintService.apply(input.targetFiles, {
            model: input.model,
            rules,
        })

        // TODO: Streaming results

        vscode.languages.createDiagnosticCollection('sourcegraph.cody-ai')
        this.diagnosticCollection.clear()
        for (const entry of entries) {
            const { file, diagnostics } = entry
            this.diagnosticCollection.set(file, diagnostics)
        }
    }

    async clean() {
        // for (const comment of this.openComments) {
        //     comment.dispose()
        // }
    }
    async addComments() {
        //TODO: fetch which files need to be checked according to the diff
        //TODO: filter out any comments that aren't due to the user's changes on the diff
        //  e.g. whas this also a comment before the user made changes
        const activeFile = vscode.window.activeTextEditor?.document
        if (!activeFile) {
            return
        }

        //pick 5 random lines
        const randomLines = new Set<number>()
        while (randomLines.size < Math.min(5, activeFile.lineCount)) {
            const lineNumber = Math.floor(Math.random() * activeFile.lineCount)
            randomLines.add(lineNumber)
        }

        // for (const line of randomLines.values()) {
        //     const comment = this.commentController.createCommentThread(
        //         activeFile.uri,
        //         new vscode.Range(line, 0, line, 0),
        //         [
        //             {
        //                 author: {
        //                     name: 'Cody',
        //                     iconPath: vscode.Uri.parse(
        //                         'https://storage.googleapis.com/sourcegraph-assets/docs/images/cody/cody-logomark-default.svg'
        //                     ),
        //                 },
        //                 body: 'This could have been done better',
        //                 mode: vscode.CommentMode.Preview,
        //             },
        //         ]
        //     )
        //     // this.openComments.push(comment)
        // }
    }

    // private registerCodeActions(config: Omit<Configuration, 'codebase'>): void {
    //     for (const disposable of this.actionProviders) {
    //         disposable.dispose()
    //     }
    //     this.actionProviders = []

    //     if (!config.codeActions) {
    //         return
    //     }

    //     this.addActionProvider(TestCodeAction)
    //     this.addActionProvider(DocumentCodeAction)
    //     this.addActionProvider(EditCodeAction)
    //     this.addActionProvider(ExplainCodeAction)
    //     this.addActionProvider(FixupCodeAction)
    // }

    // private addActionProvider(ActionType: {
    //     new (): vscode.CodeActionProvider
    //     providedCodeActionKinds: vscode.CodeActionKind[]
    // }): void {
    //     const provider = vscode.languages.registerCodeActionsProvider('*', new ActionType(), {
    //         providedCodeActionKinds: ActionType.providedCodeActionKinds,
    //     })
    //     this.actionProviders.push(provider)
    // }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        // for (const comment of this.openComments) {
        //     comment.dispose()
        // }
        // for (const disposable of this.actionProviders) {
        //     disposable.dispose()
        // }
    }
}
