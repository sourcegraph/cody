import { addTestCase, literalFacts } from '.'

addTestCase('Single Question: Access tokens', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'How I access the Sourcegraph API using an access token?',
            facts: literalFacts('Authorization'),
            answerSummary:
                'Access tokens allow users to make authenticated requests to the API using the `Authorization` header.',
        },
    ],
})

addTestCase('Single Question: Chat Models', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'What chat models and providers are available to use with Cody?',
            facts: literalFacts('anthropic', 'openai'),
            answerSummary:
                'Cody supports Anthropic and OpenAI as model providers. Cody supports Anthropic Claude, and OpenAI GPT3.5 and GPT4 as chat models.',
        },
    ],
})

addTestCase('Single Question: Notebook sharing', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'How I update the notebook share settings via the API?',
            facts: literalFacts('graphql'),
            answerSummary:
                'You can update the share settings by updating the `namespace` and `public` settings via the GraphQL API.',
        },
    ],
})

addTestCase('Single Question: Embeddings chunking', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'How do we chunk files for embeddings?',
            facts: literalFacts('SplitIntoEmbeddableChunks'),
            answerSummary:
                'The chunking algorithm for embeddings is implemented in the `SplitIntoEmbeddableChunks` function.',
        },
    ],
})

addTestCase('Single Question: Syntax highlighting', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'Which library do we use for syntax highlighting?',
            facts: literalFacts('syntect'),
            answerSummary: 'We use the `syntect` Rust library to highlight the code.',
        },
    ],
})

addTestCase('Single Question: Background worker', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'What is the recommended way to add a background worker?',
            facts: literalFacts('store', 'handler'),
            answerSummary: `The most common way to use a worker is to use the database-backed store defined in \`dbworker/store.Store\`. Here is an incomplete list of steps needed to add a background worker:
1. Create a jobs table
2. Write the model definition and scan function
3. Configure the store
4. Create the store
5. Write the handler
6. Configure the worker and resetter
7. Register the worker and resetter
`,
        },
    ],
})

addTestCase('Single Question: Notebooks telemetry', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'Which telemetry do we collect for notebooks?',
            facts: literalFacts('views', 'star', 'block'),
            answerSummary: `We collect the following telemetry information:
- Notebook Page Views,
- Notebooks List Page Views,
- Embedded Notebook Page Views,
- Notebooks Created Count,
- Notebook Added Stars Count,
- Notebook Added Markdown Blocks Count,
- Notebook Added Query Blocks Count,
- Notebook Added File Blocks Count,
- Notebook Added Symbol Blocks Count,
`,
        },
    ],
})

addTestCase('Single Question: Sourcegraph query display', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'Is there a way to nicely display the Sourcegraph search query on frontend?',
            facts: literalFacts('SyntaxHighlightedSearchQuery'),
            answerSummary:
                'Yes, you can use the `SyntaxHighlightedSearchQuery` React component to nicely display Sourcegraph search queries with syntax highlighting.',
        },
    ],
})

addTestCase('Single Question: Code Monitor queries', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'Which types of queries are allowed for Code Monitors?',
            facts: literalFacts('diff', 'commit'),
            answerSummary: 'Code Monitors support diff and commit queries.',
        },
    ],
})

addTestCase('Single Question: Embeddings storage', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'Where are embeddings indexes stored?',
            facts: literalFacts('s3', 'gcs'),
            answerSummary: 'Embeddings indexes are stored in the configured blob storage (S3 and GCS).',
        },
    ],
})

addTestCase('Single Question: Listing files and fetching their content', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question:
                'I need to list all the files in a particular repo and fetch their contents. How can I do this efficiently in Sourcegraph using Go?',
            facts: literalFacts('readfile', 'readdir', 'gitserver'),
            answerSummary:
                'The most efficient way to list the files would be to use the gitserver `ReadDir` method. To get the file content you can use the gitserver `ReadFile` method.',
        },
    ],
})

addTestCase('Single Question: Structural search implementation', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question:
                'Which library does structural search use under the hood and which language is it implemented in?',
            facts: literalFacts('comby', 'ocaml'),
            answerSummary: 'Structural search uses the `comby` library under the hood which is implemented in OCaml.',
        },
    ],
})
