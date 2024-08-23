import { assertExhaustiveSwitch } from '@sourcegraph/cody-shared/src/utils'
import * as vscode from 'vscode'
import type * as protocol from '../agent-protocol'
import { ProtocolLocation, ProtocolRange } from './internal'

export namespace ProtocolRelatedInformationDiagnostic {
    export function from(
        relatedInformation: vscode.DiagnosticRelatedInformation
    ): protocol.ProtocolRelatedInformationDiagnostic {
        return {
            location: ProtocolLocation.from(relatedInformation.location),
            message: relatedInformation.message,
        }
    }

    export function vsc(
        relatedInformation: protocol.ProtocolRelatedInformationDiagnostic
    ): vscode.DiagnosticRelatedInformation {
        return {
            location: ProtocolLocation.vsc(relatedInformation.location),
            message: relatedInformation.message,
        }
    }
}

export namespace ProtocolDiagnostic {
    export function from(uri: vscode.Uri, diagnostic: vscode.Diagnostic): protocol.ProtocolDiagnostic {
        return {
            message: diagnostic.message,
            severity: DiagnosticSeverity.from(diagnostic.severity),
            source: diagnostic.source,
            location: ProtocolLocation.from({
                uri: uri,
                range: diagnostic.range,
            }),
            code: (typeof diagnostic.code === 'object'
                ? diagnostic.code?.value
                : diagnostic.code
            )?.toString(),
            relatedInformation: diagnostic.relatedInformation?.map(
                ProtocolRelatedInformationDiagnostic.from
            ),
        }
    }

    export function vsc(diagnostic: protocol.ProtocolDiagnostic): vscode.Diagnostic {
        const out = new vscode.Diagnostic(
            ProtocolRange.vsc(diagnostic.location.range),
            diagnostic.message,
            DiagnosticSeverity.vsc(diagnostic.severity)
        )
        Object.assign(out, {
            relatedInformation: diagnostic.relatedInformation?.map(
                ProtocolRelatedInformationDiagnostic.vsc
            ),
        } satisfies Partial<vscode.Diagnostic>)
        return out
    }
}

export namespace DiagnosticSeverity {
    export function from(type: vscode.DiagnosticSeverity): protocol.DiagnosticSeverity {
        switch (type) {
            case vscode.DiagnosticSeverity.Error:
                return 'error'
            case vscode.DiagnosticSeverity.Warning:
                return 'warning'
            case vscode.DiagnosticSeverity.Information:
                return 'info'
            case vscode.DiagnosticSeverity.Hint:
                return 'suggestion'
            default:
                assertExhaustiveSwitch(type)
        }
    }

    export function vsc(type: protocol.DiagnosticSeverity): vscode.DiagnosticSeverity {
        switch (type) {
            case 'error':
                return vscode.DiagnosticSeverity.Error
            case 'warning':
                return vscode.DiagnosticSeverity.Warning
            case 'info':
                return vscode.DiagnosticSeverity.Information
            case 'suggestion':
                return vscode.DiagnosticSeverity.Hint
            default:
                assertExhaustiveSwitch(type)
        }
    }
}
