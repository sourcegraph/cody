import assert from 'node:assert'
import * as vscode from 'vscode'
import type * as protocol from '../agent-protocol'
import { Position } from './internal'

export namespace ProtocolRange {
    export function from(range: vscode.Range): protocol.Range {
        return {
            start: Position.from(range.start),
            end: Position.from(range.end),
        }
    }

    export function vsc(range: protocol.Range): vscode.Range {
        assert(
            range.end.line > range.start.line ||
                (range.end.line === range.start.line && range.end.character >= range.start.character)
        )
        return new vscode.Range(Position.vsc(range.start), Position.vsc(range.end))
    }
}
