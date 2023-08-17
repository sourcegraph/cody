import { addTestCase } from '.'

addTestCase('PyTorch Model Training', {
    // Codebase to test against.
    codebase: 'github.com/pytorch/pytorch',
    // Context type.
    context: 'embeddings',
    transcript: [
        {
            question: 'How do I train a model in PyTorch?',
            // Facts we want to see in the response.
            facts: ['Model training, backpropagation, loss functions, optimizers'],
            // Summary of the desired response. LLM judge uses this to evaluate correctness.
            answerSummary: 'Explanation of how to train a model in PyTorch',
        },
        {
            question: 'What loss functions are available in PyTorch?',
            facts: ['loss functions', 'MSELoss', 'CrossEntropyLoss'],
            answerSummary: 'List of common loss functions available in PyTorch like MSELoss and CrossEntropyLoss',
        },
    ],
})

addTestCase('PyTorch Learning Rate Scheduling', {
    // Codebase to test against.
    codebase: 'github.com/pytorch/pytorch',
    // Context type.
    context: 'embeddings',
    transcript: [
        {
            question: 'What learning rate schedulers are available in PyTorch?',
            // Facts we want to see in the response.
            facts: ['learning rate schedulers', 'StepLR', 'MultiStepLR', 'ExponentialLR', 'ReduceLROnPlateau'],
            // Summary of the desired response. LLM judge uses this to evaluate correctness.
            answerSummary: 'List of learning rate schedulers available in PyTorch',
        },
    ],
})
