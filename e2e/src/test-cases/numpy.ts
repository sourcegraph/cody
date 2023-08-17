import { addTestCase } from '.'

addTestCase('Vector dot product', {
    // Codebase to test against.
    codebase: 'github.com/numpy/numpy',
    // Context type.
    context: 'embeddings',
    transcript: [
        {
            question: 'How do I calculate the dot product of two vectors in NumPy?',
            // Facts we want to see in the response.
            facts: ['Dot product'],
            // Summary of the desired response. LLM judge uses this to evaluate correctness.
            answerSummary: 'Explanation of how to calculate dot product of two vectors in NumPy',
        },
    ],
})

addTestCase('Softmax', {
    // Codebase to test against.
    codebase: 'github.com/numpy/numpy',
    // Context type.
    context: 'embeddings',
    transcript: [
        {
            question: 'How do I calculate the softmax of a vector in NumPy?',
            // Facts we want to see in the response.
            facts: ['Softmax'],
            // Summary of the desired response. LLM judge uses this to evaluate correctness.
            answerSummary: 'Sample code of how to calculate softmax of a vector in NumPy',
        },
        {
            question:
                'How do I calculate the softmax of a vector in NumPy? Be sure to use a method which avoids numerical overflow or underflow',
            facts: ['Softmax'],
            answerSummary:
                'Sample code of how to calculate softmax of a vector in NumPy which avoids potential numerical overflow or underflow issues',
        },
    ],
})

addTestCase('Ufunc explanation', {
    // Codebase to test against.
    codebase: 'github.com/numpy/numpy',
    // Context type.
    context: 'embeddings',
    transcript: [
        {
            question: 'Please provide a detailed explanation of ufuncs in NumPy',
            // Facts we want to see in the response.
            facts: ['Ufunc'],
            // Summary of the desired response. LLM judge uses this to evaluate correctness.
            answerSummary:
                'An explanatin of NumPy ufucs including what they are, common examples, and how they work under the hood',
        },
    ],
})
