import * as vscode from 'vscode'
import type * as protocol from '../agent-protocol'
import { ProtocolRange, Uri } from './internal'

export namespace ProtocolLocation {
    export function from(location: vscode.Location): protocol.ProtocolLocation {
        return {
            uri: Uri.from(location.uri),
            range: ProtocolRange.from(location.range),
        }
    }

    export function vsc(location: protocol.ProtocolLocation): vscode.Location {
        return new vscode.Location(Uri.vsc(location.uri), ProtocolRange.vsc(location.range))
    }
}
