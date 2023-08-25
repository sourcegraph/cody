import { DebouncedFunc, throttle } from 'lodash'
import * as vscode from 'vscode'

import { VsCodeInlineController, VsCodeInlineInteractionRecipeData } from '@sourcegraph/cody-shared/src/editor'
import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { countCode, getIconPath, matchCodeSnippets } from './InlineAssist'
import { InlineInteraction } from './InlineInteration'

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
    private readonly label = 'Cody: Inline'
    private readonly threadLabel =
        '[TIPS] New Inline Chat: `ctrl + shift + c` | Submit: `cmd + enter` | Hide: `shift + esc`'
    private options = {
        prompt: "Cody Inline - Tell Cody what to change or ask a question. Use /fix or /chat to override Cody's intent detection.",
        placeHolder: 'Examples: "Simplify this code", "What does this regex do?", "Add comments to this function"',
    }
    private readonly codyIcon: vscode.Uri
    private readonly userIcon: vscode.Uri
    private _disposables: vscode.Disposable[] = []

    // Controller State
    private commentController: vscode.CommentController | null = null
    private threads = new Map<string, InlineInteraction>()

    // Track acceptance of generated code by Cody in Inline Chat
    private lastCopiedCode = { code: 'init', lineCount: 0, charCount: 0, eventName: '' }
    private insertInProgress = false
    private lastClipboardText = ''

    constructor(
        private extensionPath: string,
        private telemetryService: TelemetryService
    ) {
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

        // Track paste event - it checks if the copied text is part of the text string
        vscode.workspace.onDidChangeTextDocument(async e => {
            const changedText = e.contentChanges[0]?.text
            const { code, lineCount, charCount, eventName } = this.lastCopiedCode
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
                this.telemetryService.log(`CodyVSCodeExtension:${eventType}:Paste:clicked`, {
                    op,
                    lineCount,
                    charCount,
                })
            }
        })

        // Track clipboard text before a new inline chat is created
        // This is used for comparing the clipboard text when switching between editors to look for copy events
        vscode.window.onDidChangeVisibleTextEditors(async e => {
            // get the last editor from the event list
            const editor = e[e.length - 1]
            if (this.commentController && editor?.document?.uri?.scheme === 'comment') {
                this.lastClipboardText = await vscode.env.clipboard.readText()
            }
        })
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

    public async getThreadRecipeData(id: string): Promise<VsCodeInlineInteractionRecipeData | null> {
        const thread = this.threads.get(id)
        if (!thread) {
            return null
        }
        const document = await vscode.workspace.openTextDocument(thread.thread.uri)
        const precedingText = document.getText(
            new vscode.Range(
                thread.selectionRange.start.translate({ lineDelta: -Math.min(thread.selectionRange.start.line, 50) }),
                thread.selectionRange.start
            )
        )
        const selectedText = document.getText(thread.selectionRange)
        const followingText = document.getText(
            new vscode.Range(thread.selectionRange.end, thread.selectionRange.end.translate({ lineDelta: 50 }))
        )

        return {
            instruction: thread.instruction,
            fileName: thread.thread.uri.fsPath,
            precedingText,
            selectedText,
            followingText,
            selectionRange: thread.selectionRange,
        }
    }

    /**
     * Getter to return comment controller
     */
    public get(): vscode.CommentController | null {
        return this.commentController
    }

    public createInteraction(humanInput: string, thread: vscode.CommentThread): InlineInteraction | null {
        if (!this.commentController) {
            return null
        }
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
        const interaction = new InlineInteraction(humanInput, thread.range, thread)
        this.threads.set(interaction.id, interaction)
        return interaction
    }

    /**
     * Create a new inline task
     */
    public createThread(humanInput: string, range: vscode.Range): vscode.CommentReply | null {
        if (!this.commentController) {
            return null
        }
        const editor = vscode.window.activeTextEditor
        if (!editor || !humanInput || editor.document.uri.scheme !== 'file') {
            return null
        }
        const thread = this.commentController.createCommentThread(editor?.document.uri, range, [])
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
        const threads = {
            text: humanInput,
            thread,
        }
        return threads
    }

    /**
     * List response from Human as comment
     */
    public chat(reply: string, thread: vscode.CommentThread): void {
        // disable reply until the task is completed
        thread.canReply = false
        thread.label = this.threadLabel
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded

        const comment = new Comment(reply, 'Me', this.userIcon, thread)
        thread.comments = [...thread.comments, comment]

        void vscode.commands.executeCommand('setContext', 'cody.replied', false)
    }

    private getLatestReply(thread: vscode.CommentThread): vscode.Comment | undefined {
        if (thread.comments.length === 0) {
            return
        }

        return thread.comments[thread.comments.length - 1]
    }

    /**
     * List response from Cody as comment
     */
    public reply(text: string, thread: vscode.CommentThread, state: keyof typeof CodyInlineStateContextValue): void {
        if (thread.state === vscode.CommentThreadState.Resolved) {
            return
        }

        const contextValue = CodyInlineStateContextValue[state]
        const latestReply = this.getLatestReply(thread)
        if (latestReply instanceof Comment && latestReply.author.name === 'Cody') {
            latestReply.update(text, contextValue)
        } else {
            thread.comments = [...thread.comments, new Comment(text, 'Cody', this.codyIcon, thread, contextValue)]
        }

        // Terminal states
        if (state === 'complete' || state === 'error') {
            thread.state = state === 'error' ? 1 : 0
            thread.canReply = state !== 'error'
            void vscode.commands.executeCommand('setContext', 'cody.replied', true)
        }

        if (state === 'complete') {
            this.createCopyEventListener(text, thread)
        }
    }

    private createCopyEventListener(text: string, thread: vscode.CommentThread): void {
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
            if (e && documentUri?.fsPath === thread.uri.fsPath) {
                // check if the current range is within the selection range of the thread
                const clipboardText = await vscode.env.clipboard.readText()
                if (clipboardText === this.lastCopiedCode.code || clipboardText === lastClipboardText) {
                    return
                }
                // check if the clipboard text is part of the text string
                if (groupedText.includes(clipboardText)) {
                    this.lastClipboardText = clipboardText
                    const eventName = 'inlineChat:Copy'
                    this.setLastCopiedCode(clipboardText, eventName)
                }
            }
        })
    }

    public setLastCopiedCode(
        code: string,
        eventName: string
    ): { code: string; lineCount: number; charCount: number; eventName: string } {
        this.insertInProgress = eventName === 'insertButton'
        const { lineCount, charCount } = countCode(code)
        const codeCount = { code, lineCount, charCount, eventName }
        this.lastCopiedCode = codeCount

        const op = eventName.startsWith('insert') ? 'insert' : 'copy'
        const args = { op, charCount, lineCount }
        this.telemetryService.log(`CodyVSCodeExtension:${eventName}:clicked`, args)
        return codeCount
    }

    public abort(thread: vscode.CommentThread): void {
        const latestReply = this.getLatestReply(thread)
        if (latestReply instanceof Comment) {
            latestReply.abort()
        }
    }

    /**
     * Remove a comment thread / conversation
     */
    public delete(thread: vscode.CommentThread): void {
        if (!thread) {
            return
        }
        thread.dispose()
    }

    /**
     * Display error message when Cody is unable to complete a request
     */
    public async error(
        message = 'Please provide Cody with more details and try again.',
        thread?: vscode.CommentThread
    ): Promise<void> {
        if (!thread) {
            return
        }

        return Promise.resolve(this.reply(`Cody was unable to complete your request. ${message}`, thread, 'error'))
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
     * Naive Html Escape, only does brackets for now, but works well enough to get tags showing up in inline
     * comments that make reference to them.
     */
    private naiveHtmlEscape(text: string): string {
        return text.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    }

    /**
     * Turns string into Markdown string
     */
    private markdown(text: string): vscode.MarkdownString {
        const markdownText = new vscode.MarkdownString(this.naiveHtmlEscape(text))
        markdownText.isTrusted = true
        markdownText.supportHtml = true
        return markdownText
    }
}
