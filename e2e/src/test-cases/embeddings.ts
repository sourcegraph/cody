import { addTestCase, literalFacts } from '.'

addTestCase('Embeddings context > Explain repo-updater', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'Using code from this repository, please explain how repo-updater works?',
            answerSummary:
                'Repo updater tracks the state of repositories and schedules fetching and updates. It makes sure the database state reflects the code host state for given configuration.',
            facts: literalFacts('code host', 'database', 'prioritization'),
        },
    ],
})

addTestCase('Embeddings context > Explain nussknacker designer server', {
    codebase: 'github.com/TouK/nussknacker',
    context: 'embeddings',
    transcript: [
        {
            question: 'Using code in this repository describe the main use case of designer server?',
            answerSummary:
                'Designer server provides a REST API for managing processes and versions for the Nussknacker workflow engine.',
            facts: literalFacts('scenario', 'process', 'workflow'),
        },
    ],
})
