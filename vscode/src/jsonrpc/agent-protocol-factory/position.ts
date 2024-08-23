import assert from 'node:assert'
import * as vscode from 'vscode'
import type * as protocol from '../agent-protocol'

export namespace Position {
    export function from(position: vscode.Position): protocol.Position {
        return {
            line: position.line,
            character: position.character,
        }
    }

    export function vsc(position: protocol.Position): vscode.Position {
        assert(position.line >= 0 && position.character >= 0)
        return new vscode.Position(position.line, position.character)
    }
}
