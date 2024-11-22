import * as vscode from 'vscode';
import {getPositionAfterTextInsertion} from '../../../../text-processing/utils';

/**
 * Parses the input text containing markers and generates the corresponding
 * TextDocumentContentChangeEvent events. It also returns the original text
 * after processing the markers.
 *
 * Markers:
 * - `<I>text</I>`: Insert `text` at the position of `<I>`.
 * - `<D>text</D>`: Delete `text` starting from the position of `<D>`.
 * - `<R>text1<RM>text2</R>`: Replace `text1` with `text2` starting from the position of `<R>`.
 *
 * @param text The input text containing markers.
 * @returns An object containing the original text and the array of change events.
 */
export function parseTextAndGenerateChangeEvents(
    text: string
): { originalText: string; changeEvents: vscode.TextDocumentContentChangeEvent[] } {
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
            const deleteStartPosition = getPositionAt(currentText, currentText.length);
            const deleteEndPosition = getPositionAfterTextInsertion(deleteStartPosition, deleteText);
            const deleteRange = new vscode.Range(
                deleteStartPosition,
                deleteEndPosition
            );
            changeEvents.push({
                range: deleteRange,
                rangeOffset: currentText.length,
                rangeLength: deleteText.length,
                text: '',
            });
            originalText += deleteText;
        } else if (replaceText1 !== undefined && replaceText2 !== undefined) {
            const replaceStartPosition = getPositionAt(currentText, currentText.length);
            const replaceEndPosition = getPositionAfterTextInsertion(replaceStartPosition, replaceText1);
            const replaceRange = new vscode.Range(
                replaceStartPosition,
                replaceEndPosition
            );
            changeEvents.push({
                range: replaceRange,
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
 * Calculates the Position in the text at the given offset.
 *
 * @param text The text content.
 * @param offset The offset in the text.
 * @returns The Position corresponding to the offset.
 */
function getPositionAt(text: string, offset: number): vscode.Position {
    const lines = text.substring(0, offset).split(/\r\n|\r|\n/);
    const line = lines.length - 1;
    const character = lines[line].length;
    return new vscode.Position(line, character);
}
