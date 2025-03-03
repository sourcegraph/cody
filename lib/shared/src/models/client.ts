import { FeatureFlag, type ModelRefStr, type ServerModel } from '..'
import { ModelTag } from './tags'

// Constants placed at the top for better accessibility
export const DeepCodyAgentID = 'deep-cody'
export const ToolCodyModelRef = 'sourcegraph::2024-12-31::tool-cody'
export const ToolCodyModelName = 'tool-cody'
export const AgenticChatVersion = 'agentic-chat'

// Base model factory to reduce repetition
const createAgenticModel = (
    modelRef: ModelRefStr,
    displayName: string,
    modelName: string,
    status: ModelTag.Experimental | ModelTag.Internal,
    contextWindow: { maxInputTokens: number; maxOutputTokens: number }
): ServerModel => {
    return {
        modelRef,
        displayName,
        modelName,
        capabilities: ['chat', 'tools'],
        category: ModelTag.Agentic,
        status,
        tier: 'pro' as ModelTag.Pro,
        contextWindow,
    }
}

// Models definitions using the factory
export const TOOL_CODY_MODEL: ServerModel = createAgenticModel(
    ToolCodyModelRef,
    'Tool Cody',
    ToolCodyModelName,
    'internal' as ModelTag.Internal,
    { maxInputTokens: 45000, maxOutputTokens: 4000 }
)

const AGENTIC_CHAT_ANTHROPIC_MODEL: ServerModel = createAgenticModel(
    `anthropic::${AgenticChatVersion}::claude-3-7-sonnet-latest`,
    'Agentic chat (via Anthropic)',
    `${AgenticChatVersion}-anthropic`,
    'internal' as ModelTag.Internal,
    { maxInputTokens: 80000, maxOutputTokens: 40000 }
)

const AGENTIC_CHAT_GEMINI_MODEL: ServerModel = createAgenticModel(
    `google::${AgenticChatVersion}::gemini-2.0-flash`,
    'Agentic chat (via Gemini)',
    `${AgenticChatVersion}-gemini`,
    'internal' as ModelTag.Internal,
    { maxInputTokens: 100000, maxOutputTokens: 60000 }
)

// Pre-define this array to avoid recreation on each function call
const AgenticChatModels: ServerModel[] = [AGENTIC_CHAT_ANTHROPIC_MODEL, AGENTIC_CHAT_GEMINI_MODEL]

function getDeepCodyServerModel(): ServerModel {
    return {
        modelRef: 'sourcegraph::2023-06-01::deep-cody',
        displayName: 'Deep Cody',
        modelName: DeepCodyAgentID,
        capabilities: ['chat', 'tools'],
        category: ModelTag.Agentic,
        status: 'experimental' as ModelTag.Experimental,
        tier: 'pro' as ModelTag.Pro,
        contextWindow: {
            maxInputTokens: 45000,
            maxOutputTokens: 4000,
        },
    }
}

/**
 * Provides a list of experimental Sourcegraph client-side models that are not recognized by the backend.
 * These models are used for experimental features and functionality on the client-side.
 *
 * @returns {ServerModel | null} The experimental client-side model or null if not found.
 */
export function getExperimentalClientModelByFeatureFlag(flag: FeatureFlag): ServerModel | null {
    if (flag === FeatureFlag.DeepCody) {
        return getDeepCodyServerModel()
    }
    return null
}

export function getExperimentalClientModels(
    flags: FeatureFlag[],
    isToolCodyEnabled = false
): ServerModel[] {
    if (!flags || flags.length === 0) {
        return isToolCodyEnabled ? [...AgenticChatModels] : []
    }

    const clientSideModels: ServerModel[] = []

    // Add models based on feature flags
    for (const flag of flags) {
        const model = getExperimentalClientModelByFeatureFlag(flag)
        if (model) {
            clientSideModels.push(model)
        }
    }

    // Add tool cody models if enabled
    if (isToolCodyEnabled) {
        clientSideModels.push(TOOL_CODY_MODEL)
    }

    clientSideModels.push(...AgenticChatModels)

    return clientSideModels
}
