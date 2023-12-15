import { Message } from '../sourcegraph-api'

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

export interface Preamble {
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

const multiRepoRules = `Important rules to follow in all your responses:
- All code snippets must be markdown-formatted, and enclosed in triple backticks.
- Answer questions only if you know the answer or can make a well-informed guess; otherwise tell me you don't know.
- Do not make any assumptions about the code and file names or any misleading information.
- If you do not have access to a repository, tell me to add additional repositories to the chat context using repositories selector below the input box to help you answer the question.`

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

export function getMultiRepoPreamble(codebases: string[], customPreamble?: Preamble): Message[] {
    const actionsText = customPreamble?.actions ?? actions
    const rulesText = customPreamble?.rules ?? multiRepoRules
    const answerText = customPreamble?.answer ?? answer
    const preamble = [actionsText, rulesText]
    const preambleResponse = [answerText]

    if (codebases.length === 1) {
        return getPreamble(codebases[0])
    }

    if (codebases.length) {
        preamble.push(
            `You have access to ${codebases.length} repositories:\n` +
                codebases.map((name, index) => `${index + 1}. ${name}`).join('\n') +
                '\n You are able to answer questions about all the above repositories. ' +
                'I will provide the relevant code snippets from the files present in the above repositories when necessary to answer my questions. ' +
                'If I ask you a question about a repository which is not listed above, please tell me to add additional repositories to the chat context using the repositories selector below the input box to help you answer the question.' +
                '\n If the repository is listed above but you do not know the answer to the quesstion, tell me you do not know and what context I need to provide you for you to answer the question.'
        )

        preambleResponse.push(
            'I have access to files present in the following repositories:\n' +
                codebases.map((name, index) => `${index + 1}. ${name}`).join('\n') +
                '\\n I can answer questions about code and files present in all the above repositories. ' +
                'If you ask a question about a repository which I do not have access to, I will ask you to add additional repositories to the chat context using the repositories selector below the input box to help me answer the question. ' +
                'If I have access to the repository but do not know the answer to the question, I will tell you I do not know and what context you need to provide me for me to answer the question.'
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
