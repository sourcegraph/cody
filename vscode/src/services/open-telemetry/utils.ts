import type { Span } from '@opentelemetry/api'
import { featureFlagProvider } from '@sourcegraph/cody-shared'
import { getConfiguration } from '../../configuration'
import * as vscode from 'vscode'
import { getExtensionDetails } from '../telemetry'

// Ensure to ad exposed experiments at the very end to make sure we include experiments that the
// user is being exposed to while the span was generated
export function recordExposedExperimentsToSpan(span: Span): void {
    span.setAttributes(featureFlagProvider.getExposedExperiments())
    span.setAttributes(getExtensionDetails(getConfiguration(vscode.workspace.getConfiguration())) as any)
}
