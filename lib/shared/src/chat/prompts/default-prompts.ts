/**
 * Generates code documentation.
 * 
 * Cases handled:
 *   - When a whole file is selected, inserts a multi-line comment at top describing the whole file
 *   - When a whole function/module is selected, inserts a docstring above w/ purpose and params
 *   - When multiple lines are selected, inserts a single plain comment above the selection
 *   - When a single line is selected, inserts a plain comment above above the selection
 *   - When no code is selected, inserts a comment on nearest containing scope (i.e. function)
 * 
 * Tested with:
 *   - Typescript (we want to match https://ts.dev/style/#jsdoc-vs-comments)
 *     - https://github.com/sourcegraph/sourcegraph/blob/b150dedb550f45b6b27cba39b15984e04afecaf3/client/wildcard/src/hooks/useKeyboard.ts#L10 (generates docstring)
 *     - https://github.com/sourcegraph/sourcegraph/blob/b150dedb550f45b6b27cba39b15984e04afecaf3/client/wildcard/src/hooks/useKeyboard.ts#L12 (generates impl comment w/o params)
 *     - https://github.com/sourcegraph/sourcegraph/blob/b150dedb550f45b6b27cba39b15984e04afecaf3/client/wildcard/src/hooks/useKeyboard.ts#L14-26 (generates impl comment w/o params)
 *     - TODO
 *   - Javascript
 *     - TODO
 *   - Golang
 *     - TODO
 */
const doc = {
    description: 'Generate code documentation',
    prompt: [
        'Generate a comment briefly documenting the purpose of the selected code.',
        'Use the type of comment that is idiomatic for the language and section of code selected (e.g. for Typescript use line comments for implementation details, and jsdoc for exported code).',
        'Follow the style of any existing documentation comments. If no existing documentation comments exist, pay attention to the file path of the selected code to make sure the comments are generated in the style of that language.',
        'Only generate the documentation for the selected code, do not generate the code.',
        'Do not output any other code or comments besides the documentation.',
    ].join(' '),
    context: {
        currentDir: true,
        selection: true,
    },
    mode: 'insert',
}

const explain = {
    description: 'Explain code',
    prompt: [
        'Explain what the selected code does in simple terms.',
        'Assume the audience is a beginner programmer who has just learned the language features and basic syntax.',
        'Focus on explaining:',
        '1) The purpose of the code',
        '2) What input(s) it takes',
        '3) What output(s) it produces',
        '4) How it achieves its purpose through the logic and algorithm.',
        '5) Any important logic flows or data transformations happening.',
        'Use simple language a beginner could understand.',
        'Include enough detail to give a full picture of what the code aims to accomplish without getting too technical.',
        'Format the explanation in coherent paragraphs, using proper punctuation and grammar.',
        'Write the explanation assuming no prior context about the code is known.',
        'Do not make assumptions about variables or functions not shown in the shared code.',
        'Start the answer with the name of the code that is being explained.',
    ].join(' '),
    context: {
        currentFile: true,
    },
}

const test = {
    description: 'Generate unit tests',
    prompt: [
        'Review the shared code context and configurations to identify the test framework and libraries in use.',
        'Then, generate a suite of multiple unit tests for the functions in <selected> using the detected test framework and libraries.',
        'Be sure to import the function being tested. Follow the same patterns as any shared context.',
        'Only add packages, imports, dependencies, and assertions if they are used in the shared code.',
        'Pay attention to the file path of each shared context to see if test for <selected> already exists.',
        'If one exists, focus on generating new unit tests for uncovered cases.',
        'If none are detected, import common unit test libraries for {languageName}.',
        'Focus on validating key functionality with simple and complete assertions.',
        'Only include mocks if one is detected in the shared code.',
        'Before writing the tests, identify which test libraries and frameworks to import, e.g. "No new imports needed - using existing libs" or "Importing test framework that matches shared context usage" or "Importing the defined framework", etc.',
        'Then briefly summarize test coverage and any limitations.',
        'At the end, enclose the full completed code for the new unit tests, including all necessary imports, in a single markdown codeblock.',
        'No fragments or TODO.',
        'The new tests should validate expected functionality and cover edge cases for <selected> with all required imports, including importing the function being tested.',
        'Do not repeat existing tests.',
    ].join(' '),
    context: {
        currentDir: true,
        currentFile: true,
        selection: true,
    },
}

const smell = {
    description: 'Find code smells',
    prompt: [
        'Please review and analyze the {languageName} code I have selected and identify potential areas for improvement related to code smells, readability, maintainability, performance, security, etc.',
        'Do not list issues already addressed in the given code.',
        'Focus on providing up to 5 constructive suggestions that could make the code more robust, efficient, or align with best practices.',
        'For each suggestion, provide a brief explanation of the potential benefits.',
        'After listing any recommendations, summarize if you found notable opportunities to enhance the code quality overall or if the code generally follows sound design principles.',
        'If no issues found, reply "There are no errors."',
    ].join(' '),
}

export const defaultPrompts = {
    commands: {
        doc,
        explain,
        test,
        smell,
    },
}
