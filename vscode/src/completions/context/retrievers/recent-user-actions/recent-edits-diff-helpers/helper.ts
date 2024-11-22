import * as vscode from 'vscode';
import {getPositionAfterTextInsertion} from '../../../../text-processing/utils';
import {applyTextDocumentChanges, TextDocumentChangeGroup} from './utils';
import {createGitDiff} from '../../../../../../../lib/shared/src/editor/create-git-diff';
import {TextDocumentChange} from './base';

export function getTextDocumentChangesForText(text: string): {originalText: string, changes: TextDocumentChange[]} {
    const {originalText, changeEvents} = parseTextAndGenerateChangeEvents(text);
    const documentChanges: TextDocumentChange[] = []
    for(const change of changeEvents) {
        const insertedRange = new vscode.Range(
            change.range.start,
            getPositionAfterTextInsertion(change.range.start, change.text)
        )
        documentChanges.push({
            timestamp: Date.now(),
            change: change,
            insertedRange
        })
    }
    return {originalText, changes: documentChanges}
}

export function getDiffsForContentChanges(oldContent: string, groupedChanges: TextDocumentChangeGroup[]): string[] {
    const diffList: string[] = [];
    let currentContent = oldContent;
    for (const changeGroup of groupedChanges) {
        const newContent = applyTextDocumentChanges(currentContent, changeGroup.changes.map(change => change.change));
        const diff = createGitDiff('test.ts', currentContent, newContent)
        diffList.push(diff)
        currentContent = newContent;
    }
    return diffList;
}


/**
 * The function is used by the test classes to simulate the text changes in a document text.
 * Parses the input text containing markers and generates the corresponding
 * TextDocumentContentChangeEvent events. It also returns the original text
 * after processing the markers.
 *
 * Markers:
 * - `<I>text</I>`: Insert `text` at the position of `<I>`.
 * - `<D>text</D>`: Delete `text` starting from the position of `<D>`.
 * - `<R>text1<RM>text2</R>`: Replace `text1` with `text2` starting from the position of `<R>`.
 * - `<IC>text</IC>`: Creates a seperate insert change for each character in `text`.
 * - `<DC>text</DC>`: Creates a seperate delete change for each character in `text`.
 *
 * @param text The input text containing markers.
 * @returns An object containing the original text and the array of change events.
 */
export function parseTextAndGenerateChangeEvents(
    text: string
): { originalText: string; changeEvents: vscode.TextDocumentContentChangeEvent[] } {
    text = processContinousChangesForText(text);

    const changeEvents: vscode.TextDocumentContentChangeEvent[] = [];
    let originalText = '';
    let currentText = '';
    let currentOffset = 0;

    const regex = /<I>(.*?)<\/I>|<D>(.*?)<\/D>|<R>(.*?)<RM>(.*?)<\/R>/gs;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const [fullMatch, insertText, deleteText, replaceText1, replaceText2] = match;
        const matchIndex = match.index;

        const textBeforeMarker = text.substring(currentOffset, matchIndex);
        originalText += textBeforeMarker;
        currentText += textBeforeMarker;

        const position = getPositionAt(currentText, currentText.length);

        if (insertText !== undefined) {
            changeEvents.push({
                range: new vscode.Range(position, position),
                rangeOffset: currentText.length,
                rangeLength: 0,
                text: insertText,
            });
            currentText += insertText;
        } else if (deleteText !== undefined) {
            const deleteEndPosition = getPositionAfterTextInsertion(position, deleteText);
            changeEvents.push({
                range: new vscode.Range(position, deleteEndPosition),
                rangeOffset: currentText.length,
                rangeLength: deleteText.length,
                text: '',
            });
            originalText += deleteText;
        } else if (replaceText1 !== undefined && replaceText2 !== undefined) {
            const replaceEndPosition = getPositionAfterTextInsertion(position, replaceText1);
            changeEvents.push({
                range: new vscode.Range(position, replaceEndPosition),
                rangeOffset: currentText.length,
                rangeLength: replaceText1.length,
                text: replaceText2,
            });
            currentText += replaceText2;
            originalText += replaceText1;
        }
        currentOffset = matchIndex + fullMatch.length;
    }
    const remainingText = text.substring(currentOffset);
    originalText += remainingText;
    currentText += remainingText;
    return { originalText, changeEvents };
}

/**
 * Processes continuous changes in text by converting continuous insertion and deletion markers
 * into individual character markers.
 *
 * @param text The input text containing <IC> and <DC> markers
 * @returns The processed text with individual <I> and <D> markers for each character
 */
export function processContinousChangesForText(text: string): string {
    // Replace <IC>...</IC> with individual <I>...</I> markers for each character
    text = text.replace(/<IC>(.*?)<\/IC>/gs, (_, content) => {
        return content.split('').map((char: string) => `<I>${char}</I>`).join('');
    });

    // Replace <DC>...</DC> with individual <D>...</D> markers for each character
    text = text.replace(/<DC>(.*?)<\/DC>/gs, (_, content) => {
        return content.split('').map((char: string) => `<D>${char}</D>`).join('');
    });

    return text;
}

/**
 * Calculates the Position in the text at the given offset.
 *
 * @param text The text content.
 * @param offset The offset in the text.
 * @returns The Position corresponding to the offset.
 */
// Helper function to convert an offset to a Position (line and character)
export function getPositionAt(content: string, offset: number): vscode.Position {
    let line = 0
    let character = 0
    let i = 0
    while (i < offset) {
        if (content[i] === '\n') {
            line++
            character = 0
        } else {
            character++
        }
        i++
    }

    return new vscode.Position(line, character)
}

