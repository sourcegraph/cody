import type * as vscode from 'vscode'

import type { ContextFileSource } from '@sourcegraph/cody-shared'

// TODO(sqs)
export interface ContextItem {
    uri: vscode.Uri
    range?: vscode.Range
    content: string
    source?: ContextFileSource
    repoName?: string
    revision?: string
    title?: string
}
