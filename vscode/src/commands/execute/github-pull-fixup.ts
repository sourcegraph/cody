import { logDebug, ps, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

export async function executeGitHubPullFixupCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.github-pull-fixup', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeGitHubPullFixupCommand', 'executing', args)

        const document = getEditor()?.active?.document
        const selection = getEditor()?.active?.selection
        if (!document || !selection) {
            return
        }

        const prompt = ps`@hitesh-1997 this implementation won't handle a bunch of cases, eg SSH clone URLs. Luckily we already have a pretty robust function for massaging a gitURL convertGitCloneURLToCodebaseName`
        console.log(prompt)

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    //preInstruction: prompt,
                    mode: 'insert',
                    range: new vscode.Range(selection.start, selection.end),
                    document,
                },
                source: args?.source,
            } satisfies ExecuteEditArguments),
        }
    })
}
