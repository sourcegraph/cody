import { describe, expect, it } from 'vitest'
import { parseTextAndGenerateChangeEvents } from './helper';
import {applyTextDocumentChanges} from './utils';

describe('parseTextAndGenerateChangeEvents', () => {

    const testChanges = (
        params: {
            text: string,
            expectedOriginalString: string,
            expectedChanges: string[],
        }
    ) => {
        const { text, expectedOriginalString, expectedChanges } = params;
        const { originalText, changeEvents } = parseTextAndGenerateChangeEvents(text);
        expect(originalText).to.equal(expectedOriginalString);
        expect(changeEvents.length).to.equal(expectedChanges.length);
        for(let i=0; i<changeEvents.length; i++) {
            const changes = changeEvents.slice(0, i+1);
            const newContent = applyTextDocumentChanges(originalText, changes)
            expect(newContent).to.equal(expectedChanges[i], `Failed at index ${i}. Expected "${expectedChanges[i]}" but got "${newContent}"`);
        }
    }

    it('should handle insert markers correctly', () => {
        const text = 'This is a <I>test </I>string.'
        const expectedOriginalString = 'This is a string.'
        const expectedChanges = [
            'This is a test string.'
        ]
        testChanges({ text, expectedOriginalString, expectedChanges });
    });

    it('should handle delete markers correctly', () => {
        const text = 'This is a <D>sample </D>string.'
        const expectedOriginalString = 'This is a sample string.'
        const expectedChanges = [
            'This is a string.'
        ]
        testChanges({ text, expectedOriginalString, expectedChanges });
    });


    it('should handle replace markers correctly', () => {
        const text = 'Please <R>replace<RM>swap</R> this word.'
        const expectedOriginalString = 'Please replace this word.'
        const expectedChanges = [
            'Please swap this word.'
        ]
        testChanges({ text, expectedOriginalString, expectedChanges });
    });

    it('should handle multiple markers correctly', () => {
        const text = 'start<I> and</I> middle<D> unnecessary</D> text<R> swap<RM> change</R> end.';
        const expectedOriginalString = 'start middle unnecessary text swap end.';
        const expectedChanges = [
            'start and middle unnecessary text swap end.',
            'start and middle text swap end.',
            'start and middle text change end.'
        ]
        testChanges({ text, expectedOriginalString, expectedChanges });
    });

    it('should handle text without markers correctly', () => {
        const text = 'This is plain text.';
        const expectedOriginalString = 'This is plain text.';
        const expectedChanges: string[] = []
        testChanges({ text, expectedOriginalString, expectedChanges });
    });

    it('should ignore unmatched markers', () => {
        const inputText = 'Unmatched markers <I>insert text without closing.';
        const { originalText, changeEvents } = parseTextAndGenerateChangeEvents(inputText);

        expect(originalText).to.equal('Unmatched markers <I>insert text without closing.');
        expect(changeEvents).to.have.lengthOf(0);
    });
});
