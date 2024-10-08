import { execSync } from 'node:child_process'
import axios from 'axios'
import dotenv from 'dotenv'
import type { ChatPrompt } from './prompt-provider'

// Load environment variables from .env file
dotenv.config()

function getOpenAIApiKey(): string {
    // Try to get the API key from environment variables
    let apiKey = process.env.OPENAI_API_KEY

    // If not found, try to get it from the shell
    if (!apiKey) {
        try {
            apiKey = execSync('echo $OPENAI_API_KEY', { encoding: 'utf8' }).trim()
        } catch (error) {
            console.error('Error fetching API key from shell:', error)
        }
    }

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set in the environment variables or accessible via shell')
    }

    return apiKey
}

export async function getOpenAIChatCompletion(messages: ChatPrompt): Promise<string> {
    const apiKey = getOpenAIApiKey()

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'ft:gpt-4o-mini-2024-07-18:sourcegraph-production::AFXNjNiC',
                messages: messages,
                temperature: 0.5,
                max_tokens: 256,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                response_format: {
                    type: 'text',
                },
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
            }
        )

        return response.data.choices[0].message.content
    } catch (error) {
        console.error('Error calling OpenAI API:', error)
        throw error
    }
}
