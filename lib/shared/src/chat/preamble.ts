import { type Message } from '../sourcegraph-api'

export function getSimplePreamble(preInstruction?: string | undefined): Message[] {
    return [
        {
            speaker: 'human',
            text: `You are Cody, an AI coding assistant from Sourcegraph.${preInstruction ? ` ${preInstruction}` : ''}`,
        },
        {
            speaker: 'assistant',
            text: 'I am Cody, an AI coding assistant from Sourcegraph.',
        },
    ]
}

interface Preamble {
    actions: string
    rules: string
    answer: string
}

const actions =
    'You are Cody, an AI-powered coding assistant created by Sourcegraph. You work with me inside a text editor.'

const rules = `Important rules to follow in all your responses:
- All code snippets must be markdown-formatted, and enclosed in triple backticks.
- Answer questions only if you know the answer or can make a well-informed guess; otherwise tell me you don't know.
- Do not make any assumptions about the code and file names or any misleading information.`

const answer = `Understood. I am Cody, an AI assistant developed by Sourcegraph to help with programming tasks.
I am working with you inside an editor, and I will answer your questions based on the context you provide from your current codebases.
I will answer questions, explain code, and generate code as concisely and clearly as possible.
I will enclose any code snippets I provide in markdown backticks.
I will let you know if I need more information to answer a question.`

/**
 * Creates and returns an array of two messages: one from a human, and the supposed response from the AI assistant.
 * Both messages contain an optional note about the current codebase if it's not null.
 */
export function getPreamble(codebase: string | undefined, customPreamble?: Preamble): Message[] {
    const actionsText = customPreamble?.actions ?? actions
    const rulesText = customPreamble?.rules ?? rules
    const answerText = customPreamble?.answer ?? answer
    const preamble = [actionsText, rulesText]
    const preambleResponse = [answerText]

    if (codebase) {
        const codebasePreamble = `We are currently working in a repository called \`${codebase}\`. I will share any code snippets I can find from this codebase with you to answer my questions.`

        preamble.push(codebasePreamble)
        preambleResponse.push(
            `Understood. I will answer your questions using context you will share from the \`${codebase}\` repository.`
        )
    }

    return [
        {
            speaker: 'human',
            text: preamble.join('\n\n'),
        },
        {
            speaker: 'assistant',
            text: preambleResponse.join('\n'),
        },
    ]
}
