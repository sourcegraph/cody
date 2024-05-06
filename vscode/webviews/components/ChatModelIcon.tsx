import type { FunctionComponent } from 'react'
import { CodyLogoBW } from '../icons/CodyLogo'
import {
    AnthropicLogo,
    GeminiLogo,
    MistralLogo,
    OllamaLogo,
    OpenAILogo,
} from '../icons/LLMProviderIcons'

export function chatModelIconComponent(
    model: string
): FunctionComponent<{ size: number; className?: string }> {
    if (model.startsWith('openai/')) {
        return OpenAILogo
    }
    if (model.startsWith('anthropic/')) {
        return AnthropicLogo
    }
    if (model.startsWith('google/')) {
        return GeminiLogo
    }
    if (model.startsWith('ollama/')) {
        return OllamaLogo
    }
    if (model.includes('mixtral')) {
        return MistralLogo
    }
    return CodyLogoBW
}
