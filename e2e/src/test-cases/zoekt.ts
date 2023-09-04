import { addTestCase, literalFacts } from '.'

addTestCase('Skip files during indexing', {
    codebase: 'github.com/sourcegraph/zoekt',
    context: 'embeddings',
    transcript: [
        {
            question: 'Where do we decide which files to skip during indexing',
            facts: literalFacts('checkText', 'builder.go', 'SizeMax'),
            answerSummary:
                'One of the places where we check for valid files is the `Add` method of the `Builder` struct in the `builder.go` file. ' +
                'Binary files are found using the `CheckText` function and skipped. Files larger than `SizeMax` are skipped.',
        },
    ],
})
