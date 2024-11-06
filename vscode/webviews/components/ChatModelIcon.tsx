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
    model = model.toLowerCase()
    if (model.startsWith('openai') || model.includes('gpt')) {
        return OpenAILogo
    }
    if (model.includes('anthropic')) {
        return AnthropicLogo
    }
    if (model.startsWith('google') || model.includes('gemini')) {
        return GeminiLogo
    }
    if (model.includes('ollama')) {
        return OllamaLogo
    }
    if (model.includes('mistral') || model.includes('mixtral')) {
        return MistralLogo
    }
    return CodyLogoBW
}
