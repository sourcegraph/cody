import * as vscode from 'vscode'
import type { FuzzyLintsProvider } from './FuzzyLintsProvider'
// Handles invoking the fuzzy lints between specified diff-points
// and invoking ways to provide results to the user (comments, squiggles, etc).
// todo add a panel

export class PreRController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private commentController = vscode.comments.createCommentController('cody.pre-r', 'Cody Pre-R')
    private diagnosticCollection = vscode.languages.createDiagnosticCollection('sourcegraph.cody-ai')

    constructor(private fuzzyLintsProvider: FuzzyLintsProvider) {
        this.disposables.push(this.commentController, this.diagnosticCollection)
        vscode.commands.registerCommand('cody.pre-r.run', () => {
            this.run()
        })
        vscode.commands.registerCommand('cody.pre-r.clean', () => {
            this.run(true)
        })
    }

    async run(allOpen = false) {
        // TODO: invoke something on the FuzzyLintsProvider
        // TODO: invoke something on the DiagnosticsController to get them registered?
        // await this.addComments()
        const docs = (
            allOpen
                ? vscode.window.visibleTextEditors.map(editor => editor.document)
                : [vscode.window.activeTextEditor?.document]
        ).filter(Boolean) as vscode.TextDocument[]
        if (!docs.length) {
            return
        }
        const entries = await this.fuzzyLintsProvider.apply(docs.map(doc => doc.uri))
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
