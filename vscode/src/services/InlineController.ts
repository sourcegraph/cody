import { DebouncedFunc, throttle } from 'lodash'
import * as vscode from 'vscode'

import { ActiveTextEditorSelection, VsCodeInlineController } from '@sourcegraph/cody-shared/src/editor'
import { SURROUNDING_LINES } from '@sourcegraph/cody-shared/src/prompt/constants'

import { CodyTaskState } from '../non-stop/utils'

import { CodeLensProvider } from './CodeLensProvider'
import { countCode, editDocByUri, getIconPath, matchCodeSnippets, updateRangeOnDocChange } from './InlineAssist'
import { telemetryService } from './telemetry'

const initPost = new vscode.Position(0, 0)
const initRange = new vscode.Range(initPost, initPost)

/**
 * We map Cody's response status to a string that is used to add context to comments.
 * We can then use this to update the UI in VS Code accordingly (e.g. comments/comment/title set in package.json)
 */
enum CodyInlineStateContextValue {
    loading = 'cody-inline-loading',
    complete = 'cody-inline-complete',
    streaming = 'cody-inline-loading',
    error = 'cody-inline-complete',
}

export class InlineController implements VsCodeInlineController {
    // Controller init
    private readonly id = 'cody-inline-chat'
    private readonly label = 'Cody: Inline Chat'
    private readonly threadLabel = '[SHORTCUTS] New Inline Chat: CMD/CTRL+SHIFT+C | Hide: SHIFT+ESC'
    private options = {
        prompt: 'Cody Inline Chat - Ask Cody a question or request inline fix with `/edit` or `/touch`.',
        placeHolder:
            'Examples: "How can I improve this?", "/edit convert tabs to spaces", "/touch Create 5 different versions of this function". "/explain"',
    }
    private readonly codyIcon: vscode.Uri
    private readonly userIcon: vscode.Uri
    private _disposables: vscode.Disposable[] = []
    // Constroller State
    private commentController: vscode.CommentController | null = null
    public thread: vscode.CommentThread | null = null // a thread is a comment
    private threads = new Map<string, vscode.CommentThread>()

    // A repeating, text-based, loading indicator ("." -> ".." -> "...")
    private responsePendingInterval: NodeJS.Timeout | null = null

    private currentTaskId = ''
    // Workspace State
    private workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri
    public selection: ActiveTextEditorSelection | null = null
    public selectionRange = initRange
    // Inline Tasks States
    // If a task is in progress, the editor will use the selection range tracked by the controller
    public isInProgress = false
    private codeLenses: Map<string, CodeLensProvider> = new Map()

    // Track acceptance of generated code by Cody in Inline Chat
    private lastCopiedCode = { code: 'init', lineCount: 0, charCount: 0, eventName: '', source: '' }
    private insertInProgress = false
    private lastClipboardText = ''

    constructor(private extensionPath: string) {
        this.codyIcon = getIconPath('cody', this.extensionPath)
        this.userIcon = getIconPath('user', this.extensionPath)

        const config = vscode.workspace.getConfiguration('cody')
        const enableInlineChat = config.get('inlineChat.enabled') as boolean

        if (enableInlineChat) {
            this.commentController = this.init()
        }

        // Toggle Inline Chat on Config Change
        vscode.workspace.onDidChangeConfiguration(e => {
            const config = vscode.workspace.getConfiguration('cody')
            if (e.affectsConfiguration('cody')) {
                // Inline Chat
                const enableInlineChat = config.get('inlineChat.enabled') as boolean
                if (enableInlineChat) {
                    this.commentController = this.init()
                    return
                }
                this.commentController?.dispose()
                this.commentController = null
                this.dispose()
            }
        })
        // Track last selection range in valid doc before an action is called
        vscode.window.onDidChangeTextEditorSelection(e => {
            if (
                e.textEditor.document.uri.scheme !== 'file' ||
                e.textEditor.document.uri.fsPath !== this.thread?.uri.fsPath
            ) {
                return
            }
            const selection = e.selections[0]
            if (selection && !this.isInProgress && this.selectionRange.end.line - 2 !== selection.start.line) {
                const range = new vscode.Range(
                    new vscode.Position(Math.max(0, selection.start.line - 1), 0),
                    new vscode.Position(Math.max(0, selection.end.line + 2), 0)
                )
                this.selectionRange = range
            }
        })

        // Track and update line diff when a task for the current selected range is being processed (this.isInProgress)
        // This makes sure the comment range and highlights are also updated correctly
        vscode.workspace.onDidChangeTextDocument(e => {
            // don't track if inline chat is not enabled or not in progress
            if (
                !this.commentController ||
                !this.isInProgress ||
                !this.selectionRange ||
                e.document.uri.scheme !== 'file' ||
                e.document.uri.fsPath !== this.thread?.uri.fsPath
            ) {
                return
            }
            for (const change of e.contentChanges) {
                this.selectionRange = updateRangeOnDocChange(this.selectionRange, change.range, change.text)
            }
        })

        // Remove all the threads from current file on file close
        vscode.workspace.onDidCloseTextDocument(doc => {
            // Skip if the document is not a file
            if (doc.uri.scheme !== 'file') {
                return
            }
            const threadsInDoc = [...this.threads.values()].filter(thread => thread.uri.fsPath === doc.uri.fsPath)
            for (const thread of threadsInDoc) {
                this.delete(thread)
            }
        })

        // Track paste event - it checks if the copied text is part of the text string
        vscode.workspace.onDidChangeTextDocument(async e => {
            const changedText = e.contentChanges[0]?.text
            const { code, lineCount, charCount, eventName, source } = this.lastCopiedCode
            const clipboardText = await vscode.env.clipboard.readText()
            // Skip if the document is not a file or if the copied text is from insert
            if (!code || !changedText || e.document.uri.scheme !== 'file') {
                return
            }
            // Skip logging paste even when the change event was triggered by insert
            if (this.insertInProgress) {
                this.insertInProgress = false
                return
            }
            // the copied code should be the same as the clipboard text
            if (matchCodeSnippets(code, clipboardText) && matchCodeSnippets(code, changedText)) {
                const op = 'paste'
                const eventType = eventName.startsWith('inlineChat') ? 'inlineChat' : 'keyDown'
                // 'CodyVSCodeExtension:inlineChat:Paste:clicked' or 'CodyVSCodeExtension:keyDown:Paste:clicked'
                telemetryService.log(`CodyVSCodeExtension:${eventType}:Paste:clicked`, {
                    op,
                    lineCount,
                    charCount,
                    source,
                })
            }
        })

        // Track clipboard text before a new inline chat is created
        // This is used for comparing the clipboard text when switching between editors to look for copy events
        vscode.window.onDidChangeVisibleTextEditors(async e => {
            if (!this.commentController || !e.length || this.isInProgress) {
                return
            }

            // get the last editor from the event list
            const editor = e.at(-1)
            if (editor?.document?.uri?.scheme === 'comment') {
                this.lastClipboardText = await vscode.env.clipboard.readText()
            }
        })

        // Register commands for inline chat buttons
        this._disposables.push(
            vscode.commands.registerCommand('cody.inline.decorations.remove', id => this.removeLens(id)),
            vscode.commands.registerCommand('cody.inline.fix.undo', id => this.undo(id))
        )
    }
    /**
     * Create comment controller and set options
     */
    public init(): vscode.CommentController {
        this.commentController?.dispose()
        const commentController = vscode.comments.createCommentController(this.id, this.label)
        commentController.options = this.options
        commentController.commentingRangeProvider = {
            provideCommentingRanges: (document: vscode.TextDocument) => {
                const lineCount = document.lineCount
                return [new vscode.Range(0, 0, lineCount - 1, 0)]
            },
        }
        this._disposables.push(commentController)
        return commentController
    }
    /**
     * Getter to return comment controller
     */
    public get(): vscode.CommentController | null {
        return this.commentController
    }
    /**
     * Create a new thread (the first comment of a thread)
     */
    public create(humanInput: string, range: vscode.Range): vscode.CommentReply | null {
        if (!this.commentController) {
            return null
        }
        const editor = vscode.window.activeTextEditor
        if (!editor || !humanInput || editor.document.uri.scheme !== 'file') {
            return null
        }
        this.thread = this.commentController.createCommentThread(editor?.document.uri, range, [])
        this.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
        const threads = {
            text: humanInput,
            thread: this.thread,
        }
        return threads
    }
    /**
     * List response from Human as comment
     */
    public async chat(reply: string, thread: vscode.CommentThread, isEditMode: boolean = false): Promise<void> {
        this.isInProgress = true
        // disable reply until the task is completed
        thread.canReply = false
        thread.label = this.threadLabel
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded

        const comment = new Comment(reply, 'Me', this.userIcon, thread)
        thread.comments = [...thread.comments, comment]

        if (isEditMode) {
            await this.runEditMode(comment, thread)
        }

        this.thread = thread
        this.selection = await this.makeSelection(isEditMode)
        const firstComment = thread.comments[0]
        if (firstComment && firstComment instanceof Comment) {
            this.threads.set(firstComment.id, thread)
        }
        void vscode.commands.executeCommand('setContext', 'cody.replied', false)
    }
    private getLatestReply(): vscode.Comment | undefined {
        if (!this.thread || this.thread.comments.length === 0) {
            return
        }

        return this.thread.comments.at(-1)
    }

    /**
     * List response from Cody as comment
     */
    public reply(text: string, state: keyof typeof CodyInlineStateContextValue): void {
        if (!this.thread || this.thread.state) {
            return
        }

        const contextValue = CodyInlineStateContextValue[state]
        const latestReply = this.getLatestReply()
        if (latestReply instanceof Comment && latestReply.author.name === 'Cody') {
            latestReply.update(text, contextValue)
        } else {
            this.thread.comments = [
                ...this.thread.comments,
                new Comment(text, 'Cody', this.codyIcon, this.thread, contextValue),
            ]
        }

        const firstComment = this.thread.comments[0]
        if (firstComment && firstComment instanceof Comment) {
            this.threads.set(firstComment.id, this.thread)
        }

        // Terminal states
        if (state === 'complete' || state === 'error') {
            this.thread.state = state === 'error' ? 1 : 0
            this.thread.canReply = state !== 'error'
            void vscode.commands.executeCommand('setContext', 'cody.replied', true)
            this.isInProgress = false
        }

        if (state === 'complete') {
            this.createCopyEventListener(text)
        }
    }

    private createCopyEventListener(text: string): void {
        // get the code inside a code block with three backticks
        // get the text between the backticks
        let groupedText = ''
        const regex = /```.*\n[\S\s]*?\n```/g
        text.match(regex)?.map(match => {
            groupedText += match.replace(/```.*\n/i, '').replace('```', '')
        })
        if (!groupedText) {
            return
        }
        // check if the text is copied from the code block on document change
        vscode.window.onDidChangeTextEditorSelection(async e => {
            const documentUri = e.textEditor.document.uri
            const lastClipboardText = this.lastClipboardText
            if (e && documentUri?.fsPath === this.thread?.uri.fsPath) {
                // check if the current range is within the selection range of the thread
                const clipboardText = await vscode.env.clipboard.readText()
                if (clipboardText === this.lastCopiedCode.code || clipboardText === lastClipboardText) {
                    return
                }
                // check if the clipboard text is part of the text string
                if (groupedText.includes(clipboardText)) {
                    this.lastClipboardText = clipboardText
                    const eventName = 'inlineChat:Copy'
                    this.setLastCopiedCode(clipboardText, eventName, 'inline-chat')
                }
            }
        })
    }

    public setLastCopiedCode(
        code: string,
        eventName: string,
        source = ''
    ): { code: string; lineCount: number; charCount: number; eventName: string; source?: string } {
        // All non-copy events are considered as insertions since we don't need to listen for paste events
        this.insertInProgress = !eventName.startsWith('copy')
        const { lineCount, charCount } = countCode(code)
        const codeCount = { code, lineCount, charCount, eventName, source }
        this.lastCopiedCode = codeCount

        // Currently supported events are: copy, insert, save
        const op = eventName.includes('copy') ? 'copy' : eventName.startsWith('insert') ? 'insert' : 'save'

        const args = { op, charCount, lineCount, source }
        telemetryService.log(`CodyVSCodeExtension:${eventName}:clicked`, args)
        return codeCount
    }

    public abort(): void {
        this.setResponsePending(false)
        const latestReply = this.getLatestReply()
        if (latestReply instanceof Comment) {
            latestReply.abort()
            this.isInProgress = false
        }
    }
    /**
     * Display a "..." loading style reply from Cody.
     */
    public setResponsePending(isResponsePending: boolean): void {
        let iterations = 0

        if (!isResponsePending) {
            if (this.responsePendingInterval) {
                clearInterval(this.responsePendingInterval)
                this.responsePendingInterval = null
                iterations = 0
            }
            return
        }

        const dot = '.'
        this.reply(dot, 'loading')
        this.responsePendingInterval = setInterval(() => {
            iterations++
            const replyText = dot.repeat((iterations % 3) + 1)
            this.reply(replyText, 'loading')
        }, 500)
    }
    private undo(id: string): void {
        void this.codeLenses.get(id)?.undo(id)
        this.codeLenses.delete(id)
    }
    /**
     * Remove a comment thread / conversation
     */
    public delete(thread: vscode.CommentThread): void {
        if (!thread) {
            return
        }
        const comments = thread?.comments as Comment[]
        comments.map(comment => {
            this.codeLenses.get(comment.id)?.remove()
        })
        thread.dispose()
        this.reset()
    }
    /**
     * Reset class
     */
    public reset(): void {
        this.selectionRange = initRange
        this.thread = null
    }
    /**
     * Display error message when Cody is unable to complete a request
     */
    public async error(message = 'Please provide Cody with more details and try again.'): Promise<void> {
        const editInProgress = this.currentTaskId.length > 0
        const requestType = editInProgress ? 'edit/touch request' : 'request'
        this.reply(`Cody was unable to complete your ${requestType}. ${message}`, 'error')
        if (editInProgress) {
            await this.stopEditMode(true)
            this.isInProgress = false
        }
    }
    /**
     * Create code lense and initiate decorators for edit mode
     */
    private async runEditMode(comment: Comment, thread: vscode.CommentThread): Promise<void> {
        const lens = await this.makeCodeLenses(comment.id, this.extensionPath, thread)
        lens.updateState(CodyTaskState.working, thread.range)
        this.codeLenses.set(comment.id, lens)
        this.currentTaskId = comment.id
        void vscode.commands.executeCommand('workbench.action.collapseAllComments')
    }
    /**
     * Reset the selection range once replacement started by fixup has been completed
     * Then inform the dependents (eg. Code Lenses and Decorators) about the new range
     * so that they could update accordingly
     */
    private async stopEditMode(error = false, newRange?: vscode.Range): Promise<void> {
        if (!this.currentTaskId) {
            return
        }
        const range = newRange || this.selectionRange
        const status = error ? CodyTaskState.error : CodyTaskState.finished
        const lens = this.codeLenses.get(this.currentTaskId)
        lens?.updateState(status, range)
        if (this.thread) {
            this.thread.range = range
            this.thread.state = error ? 1 : 0
        }
        this.currentTaskId = ''
        telemetryService.log('CodyVSCodeExtension:inline-assist:stopFixup')
        if (!error) {
            await vscode.commands.executeCommand('workbench.action.collapseAllComments')
        }
        this.isInProgress = false
    }
    /**
     * Get current selected lines from the comment thread.
     * Add an extra line to the end line to prevent empty selection on single line selection
     */
    public async makeSelection(isEditMode: boolean): Promise<ActiveTextEditorSelection | null> {
        if (!this.thread) {
            return null
        }
        const activeDocument = await vscode.workspace.openTextDocument(this.thread.uri)
        const lineLength = activeDocument.lineAt(this.thread.range.end.line).text.length
        const startPost = new vscode.Position(this.thread.range.start.line, 0)
        const endPostFix = new vscode.Position(this.thread.range.end.line, lineLength)
        const endPostAsk = new vscode.Position(this.thread.range.end.line + 1, 0)
        const selectionRange = new vscode.Range(startPost, isEditMode ? endPostFix : endPostAsk)
        const precedingText = activeDocument.getText(
            new vscode.Range(
                new vscode.Position(Math.max(0, this.thread.range.start.line - SURROUNDING_LINES), 0),
                this.thread.range.start
            )
        )
        const followingText = activeDocument.getText(
            new vscode.Range(
                this.thread.range.end,
                new vscode.Position(this.thread.range.end.line + 1 + SURROUNDING_LINES, 0)
            )
        )
        // Add space when selectedText is empty --empty selectedText could cause delayed response
        const selection = {
            fileName: vscode.workspace.asRelativePath(this.thread.uri.fsPath),
            selectedText: activeDocument.getText(selectionRange) || ' ',
            precedingText,
            followingText,
            selectionRange,
        }
        this.selectionRange = selectionRange
        this.selection = selection
        return selection
    }
    /**
     * When a comment thread is open, the Editor will be switched to the comment input editor.
     * Get the current editor using the comment thread uri instead
     */
    public async makeCodeLenses(
        taskID: string,
        extPath: string,
        thread: vscode.CommentThread
    ): Promise<CodeLensProvider> {
        const lens = new CodeLensProvider(taskID, extPath, thread)
        const activeDocument = await vscode.workspace.openTextDocument(thread.uri)
        await lens.provideCodeLenses(activeDocument, new vscode.CancellationTokenSource().token)
        vscode.languages.registerCodeLensProvider('*', lens)
        return lens
    }

    public removeLens(id: string): void {
        this.codeLenses.get(id)?.remove()
        this.codeLenses.delete(id)
    }
    /**
     * Do replacement in document
     */
    public async replace(fileName: string, replacement: string, original: string): Promise<void> {
        const diff = original.trim() !== replacement.trim()
        if (!this.workspacePath || !replacement.trim() || !diff) {
            await this.stopEditMode(true)
            return
        }
        // Stop tracking for file changes to perfotm replacement
        this.isInProgress = false
        try {
            const chatSelection = this.getSelectionRange()
            const documentUri = vscode.Uri.joinPath(this.workspacePath, fileName)
            const range = new vscode.Selection(chatSelection.start, new vscode.Position(chatSelection.end.line + 1, 0))
            const newRange = await editDocByUri(
                documentUri,
                { start: range.start.line, end: range.end.line },
                replacement
            )

            const lens = this.codeLenses.get(this.currentTaskId)
            lens?.storeContext(this.currentTaskId, documentUri, original, replacement)

            await this.stopEditMode(false, newRange)
            telemetryService.log('CodyVSCodeExtension:inline-assist:replaced')
        } catch (error) {
            await this.stopEditMode(true)
            console.error(error)
            await vscode.window.showErrorMessage(
                'Edit failed. Please make sure you are in a single repository workspace and try again.'
            )
        }
    }
    /**
     * Return latest selection
     */
    public getSelection(): ActiveTextEditorSelection | null {
        return this.selection
    }
    /**
     * Return latest selection range
     */
    public getSelectionRange(): vscode.Range {
        return this.selectionRange
    }
    /**
     * Dispose the disposables
     */
    public dispose(): void {
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}

export class Comment implements vscode.Comment {
    public id: string
    public body: vscode.MarkdownString
    public mode = vscode.CommentMode.Preview
    public author: vscode.CommentAuthorInformation
    public update: DebouncedFunc<typeof this.unthrottledUpdate>

    constructor(
        public input: string,
        public name: string,
        public iconPath: vscode.Uri,
        public parent: vscode.CommentThread,
        public contextValue?: string
    ) {
        const timestamp = new Date(Date.now())
        this.id = timestamp.getTime().toString()
        this.body = this.markdown(input)
        this.author = { name, iconPath }
        /**
         * Although we can stream responses in fast intervals, VS Code limits comment updates to every 100ms.
         * We throttle the update function to ensure we do not try to update the comment too much.
         * Relevant VS Code logic: https://sourcegraph.com/github.com/microsoft/vscode@6c8cdf325eb1dc8a0e2ea9205a1d2ca05f69c101/-/blob/src/vs/workbench/api/common/extHostComments.ts?L461-492
         */
        this.update = throttle(this.unthrottledUpdate.bind(this), 500)
    }

    private unthrottledUpdate(input: string, contextValue: string): void {
        this.body = this.markdown(input)
        this.contextValue = contextValue
        this.refresh()
    }

    public abort(): void {
        // If Cody hasn't yet started streaming the response, we should just remove the comment completely.
        // There is no useful information that the user might want to retain.
        if (this.contextValue === 'cody-inline-loading') {
            this.parent.comments = this.parent.comments.slice(0, -1)
            this.parent.canReply = true
        }
        this.contextValue = undefined
        this.update.cancel()
    }

    private refresh(): void {
        // Reassigning .comments is required in order for the UI to re-render in VS Code.
        // eslint-disable-next-line no-self-assign
        this.parent.comments = this.parent.comments
    }

    /**
     * Turns string into Markdown string
     */
    private markdown(text: string): vscode.MarkdownString {
        const markdownText = new vscode.MarkdownString(text)
        markdownText.isTrusted = true
        markdownText.supportHtml = true
        return markdownText
    }
}
