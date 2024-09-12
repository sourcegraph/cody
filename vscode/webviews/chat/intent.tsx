import type { ChatMessage } from '@sourcegraph/cody-shared'

export const chatIntentTelemetryMetadataValue = (intent: ChatMessage['intent']) =>
    [undefined, 'chat', 'search'].findIndex(v => v === (intent || undefined))
