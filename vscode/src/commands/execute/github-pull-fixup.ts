import { type PromptString, logDebug, ps, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { executeEdit } from '../../edit/execute'
import type { EditCommandResult } from '../../main'
import type { FixupTask } from '../../non-stop/FixupTask'
import type { CodyCommandArgs } from '../types'

export async function executeGitHubPullFixupCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.github-pull-fixup', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeGitHubPullFixupCommand', 'executing', args)

        return {
            type: 'edit',
            task: await startCommentFixup({
                comment: ps`@hitesh-1997 this implementation won't handle a bunch of cases, eg SSH clone URLs. Luckily we already have a pretty robust function for massaging a gitURL convertGitCloneURLToCodebaseName`,
                path: 'vscode/src/repository/repo-metadata-from-git-api.ts',
                lineStart: 54,
                lineEnd: 61,
            }),
        }
    })
}

async function startCommentFixup(comment: {
    comment: PromptString
    /** relative to repo root */
    path: string
    /** 1-based */
    lineStart: number
    /** 1-based */
    lineEnd: number
}): Promise<FixupTask | undefined> {
    const document = await findDocument(comment.path)
    const startPos = document.lineAt(comment.lineStart - 1).range.start
    const endPos = document.lineAt(comment.lineEnd - 1).range.end.translate({ characterDelta: -1 })
    const range = new vscode.Selection(startPos, endPos)

    return await executeEdit({
        configuration: {
            preInstruction: comment.comment,
            mode: 'edit',
            range,
            document,
        },
    }) // source?
}

async function findDocument(relativePath: string): Promise<vscode.TextDocument> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders) {
        throw new Error('No workspace folders')
    }
    for (const workspace of workspaceFolders) {
        const uri = vscode.Uri.joinPath(workspace.uri, relativePath)
        try {
            const doc = await vscode.workspace.openTextDocument(uri)
            await vscode.window.showTextDocument(doc)
            return doc
        } catch (e) {}
    }
    throw new Error('No document found')
}
