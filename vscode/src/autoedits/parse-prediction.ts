import {CodeToReplaceData, tokensToChars} from '@sourcegraph/cody-shared';
import { diff } from 'fast-myers-diff'
import { AutoeditRequestID } from './analytics-logger/types'
import {getNewLineChar} from '../completions/text-processing';
import * as vscode from 'vscode';
import { autoeditCache } from './autoedit-cache';
import {document} from '../completions/test-helpers';
import {getCurrentDocContext} from '../completions/get-current-doc-context';
import {autoeditsProviderConfig} from './autoedits-config';
import {autoeditAnalyticsLogger, autoeditTriggerKind, getTimeNowInMillis} from './analytics-logger';

interface PredictionInput {
    document: vscode.TextDocument
    prediction: string
    codeToReplaceData: CodeToReplaceData
    requestId: AutoeditRequestID
}

interface EditPredictionInput extends PredictionInput {
    position: vscode.Position
}

async function createDocumentFromText(filePath: string, text: string): Promise<vscode.TextDocument> {
    return document(text, 'typescript', filePath)
}

function getUpdatedText(document: vscode.TextDocument, range: vscode.Range, newText: string): string {
    const text = document.getText()
    const before = text.substring(0, document.offsetAt(range.start))
    const after = text.substring(document.offsetAt(range.end))
    return before + newText + after
}

function getCurrentCursorLine(document: vscode.TextDocument): vscode.Position | null {
    // Get the active text editor
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        return editor.selection.active;
    }
    return null;
}


// Parse the prediction into multiple edits and save in cache for future use.
export async function parsePrediction(input: PredictionInput): Promise<{
    prediction: string
    codeToReplaceData: CodeToReplaceData
    requestId: AutoeditRequestID
}> {
    const str2 = input.prediction

    const oldDocument = await createDocumentFromText(input.document.uri.fsPath, input.document.getText())
    const newDocumentText = getUpdatedText(oldDocument, input.codeToReplaceData.range, str2)
    const newDocument = await createDocumentFromText(input.document.uri.fsPath, newDocumentText)

    const newLineChar = getNewLineChar(newDocument.getText())
    const originalLines = oldDocument.getText().split(newLineChar)
    const modifiedLines = newDocument.getText().split(newLineChar)

    const cursorPosition = getCurrentCursorLine(oldDocument)

    const edits: EditPredictionInput[] = []

    for (const [originalStart, originalEnd, modifiedStart, modifiedEnd] of diff(originalLines, modifiedLines)) {
        const oldCodeToRewriteRange = new vscode.Range(
            new vscode.Position(originalStart, 0),
            new vscode.Position(originalEnd, 0)
        )
        const newRange = new vscode.Range(
            new vscode.Position(modifiedStart, 0),
            new vscode.Position(modifiedEnd, 0)
        )
        const newPrediction = newDocument.getText(newRange)
        const oldCodeToRewrite = oldDocument.getText(oldCodeToRewriteRange)

        let newCodeToRewritePrefix = ''
        let newCodeToRewriteSuffix = oldCodeToRewrite
        let pos = oldCodeToRewriteRange.start

        if (cursorPosition && cursorPosition.line && cursorPosition.line >= originalStart && cursorPosition.line < originalEnd) {
            newCodeToRewritePrefix = oldDocument.getText(new vscode.Range(oldCodeToRewriteRange.start, cursorPosition))
            newCodeToRewriteSuffix = oldDocument.getText(new vscode.Range(cursorPosition, oldCodeToRewriteRange.end))
            pos = cursorPosition
        }

        const newPrefix = newDocument.getText(new vscode.Range(new vscode.Position(0, 0), newRange.start))
        const oldSuffix = oldDocument.getText(new vscode.Range(oldCodeToRewriteRange.end, oldDocument.lineAt(oldDocument.lineCount - 1).range.end))

        const codeToReplaceData: CodeToReplaceData = {
            codeToRewrite: oldCodeToRewrite,
            prefixBeforeArea: '',
            suffixAfterArea: '',
            prefixInArea: newPrefix,
            suffixInArea: oldSuffix,
            codeToRewritePrefix: newCodeToRewritePrefix,
            codeToRewriteSuffix: newCodeToRewriteSuffix,
            range: oldCodeToRewriteRange,
        }
        const interpolatedText = newPrefix + oldDocument.getText(new vscode.Range(oldCodeToRewriteRange.start, oldDocument.lineAt(oldDocument.lineCount - 1).range.end))
        const interpolatedDocument = await createDocumentFromText(input.document.uri.fsPath, interpolatedText)



        const docContext = getCurrentDocContext({
            document: interpolatedDocument,
            position: pos,
            maxPrefixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.prefixTokens),
            maxSuffixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.suffixTokens),
        })

        const startedAt = getTimeNowInMillis()
        const requestId = autoeditAnalyticsLogger.createRequest({
            startedAt,
            codeToReplaceData: codeToReplaceData,
            position: pos,
            docContext,
            document: interpolatedDocument,
            payload: {
                languageId: interpolatedDocument.languageId,
                model: autoeditsProviderConfig.model,
                codeToRewrite: codeToReplaceData.codeToRewrite,
                triggerKind: autoeditTriggerKind.automatic,
            },
        })
        autoeditAnalyticsLogger.markAsContextLoaded({
            requestId,
            payload: { contextSummary: undefined },
        })
        edits.push({
            document: interpolatedDocument,
            position: pos,
            prediction: newPrediction,
            codeToReplaceData: codeToReplaceData,
            requestId: requestId,
        })

    }

    for (let i = 0; i < edits.length; i++) {
        autoeditCache.setToCache(edits[i].document, edits[i].position, edits[i])
    }

    if (edits.length === 0) {
        return {
            prediction: input.prediction,
            codeToReplaceData: input.codeToReplaceData,
            requestId: input.requestId,
        }
    }
    return edits[0]
}
