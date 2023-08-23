import { addTestCase } from '.'

addTestCase('Skip files during indexing', {
    codebase: 'github.com/sourcegraph/zoekt',
    context: 'embeddings',
    transcript: [
        {
            question: 'Where do we decide which files to skip during indexing',
            facts: ['checkText', 'indexbuilder.go', 'builder.go'],
            answerSummary:
                'We decide using the `checkText` function defined in `indexbuilder.go`. We use it in the `builder.go` file to check if the files we are indexing are valid source texts.',
        },
    ],
})
