import { addTestCase } from '.'

addTestCase('PyTorch Model Training', {
    codebase: 'github.com/pytorch/pytorch',
    context: 'embeddings',
    transcript: [
        {
            question: 'How do I train a model in PyTorch?',
            facts: ['Model training', 'backpropagation', 'loss functions', 'optimizers'],
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
    codebase: 'github.com/pytorch/pytorch',
    context: 'embeddings',
    transcript: [
        {
            question: 'What learning rate schedulers are available in PyTorch?',
            facts: ['learning rate schedulers', 'StepLR', 'MultiStepLR', 'ExponentialLR', 'ReduceLROnPlateau'],
            answerSummary: 'List of learning rate schedulers available in PyTorch',
        },
    ],
})
