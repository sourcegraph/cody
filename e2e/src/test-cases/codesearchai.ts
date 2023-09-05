import { addTestCase, literalFacts, regexpFacts } from '.'

addTestCase('Dataset', {
    codebase: 'github.com/sourcegraph/codesearch.ai',
    context: 'embeddings',
    transcript: [
        {
            question: 'Code snippets from which languages are used to train the codesearch.ai model?',
            answerSummary:
                'Code snippets from six languages are used in the dataset to train the model: Javascript, Python, Go, Java, PHP, and Ruby. No other languages are used.',
            facts: literalFacts('javascript', 'python', 'go', 'php', 'ruby', 'java'),
        },
        {
            question: 'How do I add support for code snippets from the Rust language?',
            answerSummary:
                'You will have to add Rust function extractor using tree-sitter in the `functionextractor` package and add it to the `getFunctionExtractorForFile` function.',
            facts: literalFacts('functionextractor', 'getFunctionExtractorForFile'),
        },
        {
            question: 'What sources are used to collect the dataset?',
            answerSummary:
                'We parse open source code from GitHub repositories and questions from StackOverflow to collect the dataset.',
            facts: regexpFacts('stack\\s*overflow').concat(literalFacts('github')),
        },
    ],
})
