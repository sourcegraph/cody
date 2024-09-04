import * as vscode from 'vscode'
import type * as agent_protocol from './protocol-alias'

export function vscodeLocation(location: agent_protocol.ProtocolLocation): vscode.Location {
    return new vscode.Location(vscode.Uri.parse(location.uri), vscodeRange(location.range))
}
export function vscodeRange(range: agent_protocol.Range): vscode.Range {
    return new vscode.Range(vscodePosition(range.start), vscodePosition(range.end))
}

function vscodePosition(pos: agent_protocol.Position): vscode.Position {
    return new vscode.Position(pos.line, pos.character)
}

function protocolPosition(pos: vscode.Position): agent_protocol.Position {
    return { line: pos.line, character: pos.character }
}

export function protocolRange(pos: vscode.Range): agent_protocol.Range {
    return { start: protocolPosition(pos.start), end: protocolPosition(pos.end) }
}
