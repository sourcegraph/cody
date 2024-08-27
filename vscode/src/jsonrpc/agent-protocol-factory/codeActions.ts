import { assertExhaustiveSwitch } from '@sourcegraph/cody-shared/src/utils'
import * as uuid from 'uuid'
import * as vscode from 'vscode'
import type * as protocol from '../agent-protocol'
import { ProtocolDiagnostic } from './internal'

export namespace ProtocolCodeAction {
    export function from(
        uri: vscode.Uri,
        action: vscode.CodeAction,
        id: string = uuid.v4()
    ): protocol.ProtocolCodeAction {
        return {
            id,
            title: action.title,
            kind: action.kind?.value,
            diagnostics: action.diagnostics?.map(diagnostic => ProtocolDiagnostic.from(uri, diagnostic)),
            disabled: action.disabled,
            isPreferred: action.isPreferred,
        }
    }
}

export namespace CodeActionTriggerKind {
    export function from(triggerKind: vscode.CodeActionTriggerKind): protocol.CodeActionTriggerKind {
        switch (triggerKind) {
            case vscode.CodeActionTriggerKind.Invoke:
                return 'Invoke'
            case vscode.CodeActionTriggerKind.Automatic:
                return 'Automatic'
            default:
                assertExhaustiveSwitch(triggerKind)
        }
    }

    export function vsc(kind: protocol.CodeActionTriggerKind): vscode.CodeActionTriggerKind {
        switch (kind) {
            case 'Invoke':
                return vscode.CodeActionTriggerKind.Invoke
            case 'Automatic':
                return vscode.CodeActionTriggerKind.Automatic
            default:
                assertExhaustiveSwitch(kind)
        }
    }
}
