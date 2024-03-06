import type { InteractionJSON } from './interaction'

interface EnhancedContextJSON {
    // For enterprise multi-repo search, the manually selected repository names
    // (for example "github.com/sourcegraph/sourcegraph") and IDs
    selectedRepos: { id: string; name: string }[]
}

export interface TranscriptJSON {
    // This is the timestamp of the first interaction.
    id: string
    chatModel?: string
    chatTitle?: string
    interactions: InteractionJSON[]
    lastInteractionTimestamp: string
    enhancedContext?: EnhancedContextJSON
}
