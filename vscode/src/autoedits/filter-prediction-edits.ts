import { createTwoFilesPatch } from 'diff'
import * as vscode from 'vscode'
import { applyTextDocumentChanges } from '../completions/context/retrievers/recent-user-actions/recent-edits-diff-helpers/utils'
import { RecentEditsTracker } from '../completions/context/retrievers/recent-user-actions/recent-edits-tracker'
import { autoeditsLogger } from './logger'

const MAX_FILTER_AGE_MS = 1000 * 30 // 30 seconds

export class FilterPredictionBasedOnRecentEdits implements vscode.Disposable {
    private readonly recentEditsTracker: RecentEditsTracker

    constructor(
        workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles' | 'onDidOpenTextDocument'
        > = vscode.workspace
    ) {
        this.recentEditsTracker = new RecentEditsTracker(MAX_FILTER_AGE_MS, workspace)
    }

    /**
     * Filters out predictions from auto-edit suggestion which undo the latest recent edits made by the user.
     * The function compares diffs between document states and the prediction vs code to re-write
     * to determine if the same edit was recently reverted.
     */
    public shouldFilterPrediction(uri: vscode.Uri, prediction: string, codeToRewrite: string): boolean {
        const trackedDocument = this.recentEditsTracker.getTrackedDocumentForUri(uri)
        if (!trackedDocument) {
            return false
        }
        const finalDocumentSnapshot = applyTextDocumentChanges(
            trackedDocument.content,
            trackedDocument.changes.map(c => c.change)
        )
        let documentSnapshot = trackedDocument.content
        for (const change of trackedDocument.changes) {
            if (
                this.isTextDocumentChangeReverted(
                    finalDocumentSnapshot,
                    documentSnapshot,
                    prediction,
                    codeToRewrite
                )
            ) {
                return true
            }
            documentSnapshot = applyTextDocumentChanges(documentSnapshot, [change.change])
        }
        return false
    }

    /**
     * Checks if a text document change has been reverted by comparing diffs.
     * @param finalDocumentSnapshot The final state of the document
     * @param documentSnapshot The current snapshot of the document
     * @param prediction The predicted code change
     * @param codeToRewrite The original code being rewritten
     * @returns True if the change has been reverted, false otherwise
     */
    private isTextDocumentChangeReverted(
        finalDocumentSnapshot: string,
        documentSnapshot: string,
        prediction: string,
        codeToRewrite: string
    ): boolean {
        // We compare two diffs:
        // 1. The diff between a document snapshot and its final state (how the document changed)
        // 2. The diff between the prediction and the code to rewrite (how the prediction would change the code)
        // If these diffs are identical, it means the prediction would make the same changes as a recent edit,
        // but in the opposite direction (i.e., reverting the change)
        const diff1 = this.createGitDiffForSnapshotComparison(documentSnapshot, finalDocumentSnapshot)
        const diff2 = this.createGitDiffForSnapshotComparison(prediction, codeToRewrite)
        if (diff1 === diff2) {
            if (diff1.length > 0) {
                autoeditsLogger.logDebug(
                    'Autoedits',
                    'Filtered the prediction based on recent edits match',
                    'Diff calculated for filtering based on recent edits\n',
                    diff1
                )
            }
            return true
        }
        return false
    }

    private createGitDiffForSnapshotComparison(oldContent: string, newContent: string): string {
        const diff = createTwoFilesPatch('a/file', 'b/file', oldContent, newContent, '', '', {
            context: 0,
        })
        // First 4 lines are headers and file name
        return diff.split('\n').slice(4).join('\n')
    }

    dispose() {
        this.recentEditsTracker.dispose()
    }
}
