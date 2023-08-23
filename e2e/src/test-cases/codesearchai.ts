import { addTestCase } from '.'

addTestCase('Dataset', {
    codebase: 'github.com/sourcegraph/codesearch.ai',
    context: 'embeddings',
    transcript: [
        {
            question: 'Samples from which languages are used to train the codesearch.ai model?',
            answerSummary:
                'Exactly six languages are used in the dataset to train the model: Javascript, Python, Go, Java, PHP, and Ruby. No other languages are used.',
            facts: [],
        },
        {
            question: 'How do I add support for the Rust language?',
            answerSummary:
                'You will have to add Rust function extractor using tree-sitter in the `functionextractor` package and add it to the `getFunctionExtractorForFile` function.',
            facts: ['functionextractor', 'getFunctionExtractorForFile'],
        },
        {
            question: 'What sources are used to collect the dataset?',
            answerSummary:
                'We parse open source code from GitHub repositories and questions from StackOverflow to collect the dataset.',
            facts: ['StackOverflow', 'GitHub'],
        },
    ],
})
