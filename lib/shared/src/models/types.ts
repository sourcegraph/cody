import type { ModelProvider } from '.'
import type { GeminiModelConfig } from '../google'

export enum ModelUsage {
    Chat = 'chat',
    Edit = 'edit',
}

// Utility to narrow a model type to a specific model usage
type HasUsage<T, I> = T extends { usage: readonly ModelUsage[] }
    ? I extends T['usage'][number]
        ? T
        : never
    : never

type Models = typeof ModelProvider

/**
 * Available models for Edit.
 * This is either:
 * - one of the availble options (dotcom)
 * - an unknown `string` (enterprise)
 */
export type EditModel =
    | {
          [K in keyof Models]: HasUsage<Models[K], ModelUsage.Edit>
      }[keyof Models]['model']
    | (string & {})

/**
 * Available models for Chat.
 * This is either:
 * - one of the availble options (dotcom)
 * - an unknown `string` (enterprise)
 */
export type ChatModel =
    | {
          [K in keyof Models]: HasUsage<Models[K], ModelUsage.Chat>
      }[keyof Models]['model']
    | (string & {})

export type CompletionsModelConfig = GeminiModelConfig
