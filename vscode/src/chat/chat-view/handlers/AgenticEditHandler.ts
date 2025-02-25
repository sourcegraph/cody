import { type ContextItem, PromptString, ps } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getDiagnosticsTextBlock, getUpdatedDiagnostics } from '../../../commands/context/diagnostic'
import { executeEdit } from '../../../edit/execute'
import { getEditor } from '../../../editor/active-editor'
import { chatDiff } from '../../../non-stop/line-diff'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

export class AgenticEditHandler implements AgentHandler {
    constructor(protected modelId: string) {}

    public async handle(
        req: AgentRequest,
        delegate: AgentHandlerDelegate,
        context?: ContextItem[]
    ): Promise<void> {
        const editor = getEditor()?.active
        if (!editor?.document) {
            delegate.postError(new Error('No active editor'), 'transcript')
            delegate.postDone()
            return
        }
        const abortSignal = req.signal
        const postProgressToWebview = (msgs: string[]) => {
            const message = msgs.join('\n\n')
            delegate.postMessageInProgress({
                speaker: 'assistant',
                text: PromptString.unsafe_fromLLMResponse(message),
                model: this.modelId,
            })
        }

        const document = editor.document
        const fullRange = document.validateRange(new vscode.Range(0, 0, document.lineCount, 0))
        let currentDiagnostics = vscode.languages.getDiagnostics()

        let attempts = 0
        const MAX_ATTEMPTS = 5
        let currentInstruction = req.inputText

        const messageInProgress = []

        while (attempts < MAX_ATTEMPTS) {
            abortSignal.throwIfAborted()
            attempts++
            const task = await executeEdit({
                configuration: {
                    document,
                    range: fullRange,
                    userContextFiles: context,
                    instruction: currentInstruction,
                    mode: 'edit',
                    intent: currentInstruction?.includes(ps`unit test`) ? 'edit' : 'edit',
                },
            })

            if (!task) {
                delegate.postError(new Error('Failed to execute edit command'), 'transcript')
                delegate.postDone()
                return
            }

            const diffs =
                task.diff ||
                (task.replacement
                    ? [
                          {
                              type: 'insertion',
                              text: task.replacement,
                              range: task.originalRange,
                          },
                      ]
                    : [])

            messageInProgress.push(chatDiff(diffs, document, { showFullFile: false }))
            postProgressToWebview(messageInProgress)

            abortSignal.throwIfAborted()

            // We need to give it time for the
            const latestDiagnostics = vscode.languages.getDiagnostics()
            const problems = getUpdatedDiagnostics(currentDiagnostics, latestDiagnostics)

            if (!problems.length) {
                break // Success! No more problems
            }

            if (attempts < MAX_ATTEMPTS) {
                const problemText = getDiagnosticsTextBlock(problems)
                const diagnosticsBlock = PromptString.unsafe_fromLLMResponse(problemText)
                const retryMessage = `Attempt ${attempts}/${MAX_ATTEMPTS}: Found issues, trying to fix:\n${problemText}`
                messageInProgress.push(retryMessage)
                postProgressToWebview(messageInProgress)

                // Update instruction with current problems for next attempt
                currentInstruction = currentInstruction.concat(
                    ps`\nPrevious attempt resulted in these issues:\n${diagnosticsBlock}`
                )
                currentDiagnostics = latestDiagnostics
            }
        }

        if (attempts === MAX_ATTEMPTS) {
            messageInProgress.push(
                `Reached maximum number of attempts (${MAX_ATTEMPTS}). Some issues may remain.`
            )
        }

        postProgressToWebview(messageInProgress)
        delegate.postDone()
    }
}
