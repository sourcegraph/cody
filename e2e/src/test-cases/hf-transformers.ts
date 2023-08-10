import { addTestCase } from '.'

addTestCase('Beam search', {
    codebase: 'github.com/huggingface/transformers',
    context: 'embeddings',
    transcript: [
        {
            question: 'Where is beam search implemented?',
            answerSummary: `The beam search algorithm is implemented in the transformers library in these files:
* generation/beam_search.py - Contains the main BeamSearchScorer class that implements the beam search logic.
* generation/utils.py - Contains the GenerationMixin.beam_search() method that wraps the BeamSearchScorer and provides the interface for models to perform beam search.
`,
            facts: ['beam_search', 'BeamSearchScorer', 'GenerationMixin'],
        },
        {
            question: 'How do you configure it?',
            answerSummary: `You configure it by providing the following non-exhaustive list of parameters to BeamSearchScorer:
* batch_size
* num_beams
* length_penalty
* do_early_stopping
* num_beam_groups
* max_length
`,
            facts: ['batch_size', 'num_beams', 'length_penalty', 'do_early_stopping', 'num_beam_groups', 'max_length'],
        },
    ],
})
