import Anthropic from '@anthropic-ai/sdk'
import { AzureKeyCredential, OpenAIClient } from '@azure/openai'

import { CLIOptions } from '.'

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

const maxTokensToSample = 300

export async function llmJudge(
    provider: CLIOptions['provider'],
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
        'Allow irrelevant details in the candidate answer that do not impact the core idea of the summary.\n\n',
        transcript.length === 0 ? 'Conversation transcript is empty.\n\n' : serializeConversationTranscript(transcript),
        `Question:\n${wrapInMarkdownBlock(question)}`,
        `Correct answer summary:\n${wrapInMarkdownBlock(answerSummary)}`,
        `Candidate answer:\n${wrapInMarkdownBlock(candidateAnswer)}\n`,
        'Does the candidate answer contain the core ideas of the correct answer summary?\n\n',
        'Use the following structure:\nThought: Your thought process.\nConclusion: YES, NO, or PARTIAL.\n',
        'Think step by step. Conclude your thought process with YES, NO, or PARTIAL in all capital letters as the final judgement.',
    ].join('')

    switch (provider) {
        case 'anthropic':
            return anthropicJudge(instructions)
        case 'azure':
            return azureJudge(instructions)
    }
}

async function anthropicJudge(instructions: string): Promise<LLMJudgement> {
    const completion = await anthropic.completions.create({
        model: 'claude-2',
        max_tokens_to_sample: maxTokensToSample,
        prompt: `${Anthropic.HUMAN_PROMPT}${instructions}${Anthropic.AI_PROMPT}Thought:`,
    })
    return {
        answerMatchesSummary: doesAnswerMatchSummary(completion.completion),
        answerMatchesSummaryJudgement: completion.completion,
    }
}

// failFastIfAzureEnvVarsNotSet validates the environment variables needed
// to run e2e suite against Azure OpenAI. It exists the process early
// if any of the variables are not present.
export const failFastIfAzureEnvVarsNotSet = (): void => {
    const requiredVars = ['AZURE_API_KEY', 'AZURE_API_ENDPOINT', 'AZURE_DEPLOYMENT_ID']
    const missingVars = requiredVars.filter(varName => !(varName in process.env))
    if (missingVars.length > 0) {
        console.log(`Missing required environment variables: ${missingVars.join(', ')}`)
        console.log('1. https://portal.azure.com > Azure OpenAI > sourcegraph-test-oai > Keys and Endpoint')
        let nextBulletPoint = 2
        if (!process.env.AZURE_API_KEY) {
            console.log(`${nextBulletPoint}. Copy the key and export AZURE_API_KEY="<paste the key here>"`)
            nextBulletPoint++
        }
        if (!process.env.AZURE_API_ENDPOINT) {
            console.log(
                `${nextBulletPoint}. Copy the endpoint and export AZURE_API_ENDPOINT="<paste the endpoint here>"`
            )
        }
        if (!process.env.AZURE_DEPLOYMENT_ID) {
            console.log(
                `${nextBulletPoint}. Go to Model Deployments > Manage Deployments. Find the deployment name and:`
            )
            console.log('   export AZURE_DEPLOYMENT_ID="<paste deployment name here>"')
        }
        process.exit(1)
    }
}

async function azureJudge(instructions: string): Promise<LLMJudgement> {
    // 1. https://portal.azure.com > Azure OpenAI > sourcegraph-test-oai > Keys and Endpoint
    // 2. Copy the key and export AZURE_API_KEY="<paste the key here>"
    // 3. Copy the endpoint and export AZURE_API_ENDPOINT="<paste the endpoint here>"
    // 4. Go to Model Deployments > Manage Deployments. Find the deployment name and:
    //    export AZURE_DEPLOYMENT_ID="<paste deployment name here>"
    const azureApiKey = process.env.AZURE_API_KEY as string
    const endpoint = process.env.AZURE_API_ENDPOINT as string

    const client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey))
    const deploymentId = process.env.AZURE_DEPLOYMENT_ID as string
    const result = await client.getCompletions(deploymentId, [instructions], { maxTokens: maxTokensToSample })
    // Pick the first choice. Probably we can do something better here?
    const [response] = result.choices

    return {
        answerMatchesSummary: doesAnswerMatchSummary(response.text),
        answerMatchesSummaryJudgement: response.text,
    }
}

function doesAnswerMatchSummary(response: string): LLMJudgement['answerMatchesSummary'] {
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
