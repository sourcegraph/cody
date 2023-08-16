import Anthropic from '@anthropic-ai/sdk'

export interface LLMJudgement {
    answerMatchesSummary: 'yes' | 'no' | 'partial' | 'unknown'
    answerMatchesSummaryJudgement: string
}

const anthropic = new Anthropic()

function wrapInMarkdownBlock(text: string): string {
    return `\`\`\`\n${text}\n\`\`\`\n`
}

function serializeConversationTranscript(transcript: { question: string; answer: string }[]): string {
    const transcriptSerialized = transcript
        .map(
            ({ question, answer }) =>
                `Question:\n${wrapInMarkdownBlock(question)}Answer:\n${wrapInMarkdownBlock(answer)}`
        )
        .join('')

    return `Conversation transcript:\n${transcriptSerialized}\n`
}

export async function llmJudge(
    transcript: { question: string; answer: string }[],
    question: string,
    answerSummary: string,
    candidateAnswer: string
): Promise<LLMJudgement> {
    const instructions = [
        'You are an expert at judging conversations. ',
        'I am going to provide a conversation transcript, the latest question, the summary of the correct answer, and the candidate answer. ',
        'Your job is to judge the candidate answer to the latest question. ',
        'The candidate answer should contain the core idea of the summary. ',
        transcript.length === 0 ? 'Conversation transcript is empty.\n\n' : serializeConversationTranscript(transcript),
        `Question:\n${wrapInMarkdownBlock(question)}`,
        `Correct answer summary:\n${wrapInMarkdownBlock(answerSummary)}`,
        `Candidate answer:\n${wrapInMarkdownBlock(candidateAnswer)}\n`,
        'Does the candidate answer contain the core ideas of the correct answer summary?\n\n',
        'Use the following structure:\nThought: Your thought process.\nConclusion: YES, NO, or PARTIAL.\n',
        'Think step by step. Conclude your thought process with YES, NO, or PARTIAL in all capital letters as the final judgement.',
    ].join('')

    const completion = await anthropic.completions.create({
        model: 'claude-2',
        max_tokens_to_sample: 300,
        prompt: `${Anthropic.HUMAN_PROMPT}${instructions}${Anthropic.AI_PROMPT}Thought:`,
    })

    return {
        answerMatchesSummary: parseJudgementResponse(completion.completion),
        answerMatchesSummaryJudgement: completion.completion,
    }
}

const CONCLUSION_REGEXP = /conclusion:\s+(yes|no|partial)/i

function parseJudgementResponse(response: string): LLMJudgement['answerMatchesSummary'] {
    const conclusion = CONCLUSION_REGEXP.exec(response)
    if (conclusion) {
        return conclusion[1].toLowerCase() as LLMJudgement['answerMatchesSummary']
    }

    // Fallback to searching for conclusion anywhere in response.
    if (response.includes('YES')) {
        return 'yes'
    }
    if (response.includes('NO')) {
        return 'no'
    }
    if (response.includes('PARTIAL')) {
        return 'partial'
    }
    return 'unknown'
}
