import type * as vscode from 'vscode'

import type { ContextFileSource } from '@sourcegraph/cody-shared'

export interface ContextItem {
    uri: vscode.Uri
    range?: vscode.Range
    text: string
    source?: ContextFileSource
    repoName?: string
    revision?: string
    title?: string
}
