import * as vscode from 'vscode'

import { logDebug, ps, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

import { getEditDefaultProvidedRange } from '../../edit/utils/edit-selection'

function getRanges(editor: vscode.TextEditor): {
    range?: vscode.Range
    insertionPoint?: vscode.Position
} {
    const defaultRange = getEditDefaultProvidedRange(editor.document, editor.selection)

    if (defaultRange) {
        return {
            range: defaultRange,
            insertionPoint: defaultRange.start,
        }
    }

    // No usable selection, fallback to expanding the range to the nearest block,
    // as is the default behavior for all "Edit" commands
    return {}
}

export async function executeGitHubPullFixupCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.github-pull-fixup', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeGitHubPullFixupCommand', 'executing', args)

        const editor = args?.uri ? await vscode.window.showTextDocument(args.uri) : getEditor()?.active
        const document = editor?.document

        if (!document) {
            return undefined
        }

        if (args?.range) {
            editor.selection = new vscode.Selection(args.range.start, args.range.end)
        }

        const { range, insertionPoint } = getRanges(editor)

        const prompt = ps`@hitesh-1997 this implementation won't handle a bunch of cases, eg SSH clone URLs. Luckily we already have a pretty robust function for massaging a gitURL convertGitCloneURLToCodebaseName`

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    preInstruction: prompt,
                    mode: 'insert',
                    range,
                    insertionPoint,
                },
                source: args?.source,
            } satisfies ExecuteEditArguments),
        }
    })
}
