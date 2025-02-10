import { describe, expect, it } from "vitest";
import { makeFilePathsClickable } from "./utils";

const cases: { should: string, input: string, expected: string; }[] = [
    {
        should: 'return the original string if no file paths are found',
        input: 'This is a test string without file paths.',
        expected: 'This is a test string without file paths.',
    },
    {
        should: 'make a single file path clickable',
        input: 'Click here: /src/app.js',
        expected: 'Click here: [/src/app.js](/src/app.js)',
    },
    {
        should: 'make multiple file paths clickable',
        input: 'Files: /src/app.js, /tests/utils.test.js',
        expected: 'Files: [/src/app.js](/src/app.js), [/tests/utils.test.js](/tests/utils.test.js)',
    },
    {
        should: 'handle file paths with line numbers',
        input: 'Error on /src/app.js:42',
        expected: 'Error on [/src/app.js:42](/src/app.js#L42)',
    },
    {
        should: 'handle file paths with line ranges',
        input: 'Change made in /src/app.js:10-20',
        expected: 'Change made in [/src/app.js:10-20](/src/app.js#L10-L20)',
    },
    {
        should: 'handle file paths with query strings',
        input: 'Visit /src/app.js?foo=bar',
        expected: 'Visit [/src/app.js?foo=bar](/src/app.js?foo=bar)',
    },
];

describe('makeFilePathsClickable', () => {
    for (const tc of cases) {
        it(tc.should, () => {
            const result = makeFilePathsClickable(tc.input);
            expect(result).toBe(tc.expected);
        });
    }
});
