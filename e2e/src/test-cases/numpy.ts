import { addTestCase } from '.'

addTestCase('Vector dot product', {
    codebase: 'github.com/numpy/numpy',
    context: 'embeddings',
    transcript: [
        {
            question: 'How do I calculate the dot product of two vectors in NumPy?',
            facts: ['Dot product'],
            answerSummary: 'Explanation of how to calculate dot product of two vectors in NumPy',
        },
    ],
})

addTestCase('Softmax', {
    codebase: 'github.com/numpy/numpy',
    context: 'embeddings',
    transcript: [
        {
            question: 'How do I calculate the softmax of a vector in NumPy?',
            facts: ['Softmax'],
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
    codebase: 'github.com/numpy/numpy',
    context: 'embeddings',
    transcript: [
        {
            question: 'Please provide a detailed explanation of ufuncs in NumPy',
            facts: ['Ufunc'],
            answerSummary:
                'An explanation of NumPy ufuncs, including what they are, common examples, and how they work under the hood',
        },
    ],
})
