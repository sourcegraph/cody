import type { FunctionComponent } from 'react'
import {
    AnthropicLogo,
    GeminiLogo,
    MistralLogo,
    OllamaLogo,
    OpenAILogo,
} from '../icons/LLMProviderIcons'

export function chatModelIconComponent(
    model: string
): FunctionComponent<{ size: number; className?: string }> | null {
    if (model.startsWith('openai/')) {
        return OpenAILogo
    }
    if (model.startsWith('anthropic/')) {
        return AnthropicLogo
    }
    if (model.startsWith('google/')) {
        return GeminiLogo
    }
    if (model.includes('mixtral')) {
        return MistralLogo
    }
    if (model.includes('ollama')) {
        return OllamaLogo
    }
    return null
}
