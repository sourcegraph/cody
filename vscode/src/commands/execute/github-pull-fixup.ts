import { logDebug, ps, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

export async function executeGitHubPullFixupCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.github-pull-fixup', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeGitHubPullFixupCommand', 'executing', args)

        const commentPath = 'vscode/src/repository/repo-metadata-from-git-api.ts'
        const lineStart = 54
        const lineEnd = 61

        const document = await findDocument(commentPath)
        const startPos = document.lineAt(lineStart - 1).range.start
        const endPos = document.lineAt(lineEnd - 1).range.end.translate({ characterDelta: -1 })

        const prompt = ps`@hitesh-1997 this implementation won't handle a bunch of cases, eg SSH clone URLs. Luckily we already have a pretty robust function for massaging a gitURL convertGitCloneURLToCodebaseName`

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    preInstruction: prompt,
                    mode: 'edit',
                    range: new vscode.Selection(startPos, endPos),
                    document,
                },
                source: args?.source,
            } satisfies ExecuteEditArguments),
        }
    })
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
