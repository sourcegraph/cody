import type { DEFAULT_DOT_COM_MODELS } from './dotcom'

export enum ModelUsage {
    Chat = 'chat',
    Edit = 'edit',
    Autocomplete = 'autocomplete',
}

// Utility to narrow a model type to a specific model usage
type HasUsage<T, I> = T extends { usage: readonly ModelUsage[] }
    ? I extends T['usage'][number]
        ? T
        : never
    : never

type Models = typeof DEFAULT_DOT_COM_MODELS

/**
 * Available models for Edit.
 * This is either:
 * - one of the available options (dotcom)
 * - an unknown `string` (enterprise)
 */
export type EditModel =
    | {
          [K in keyof Models]: HasUsage<Models[K], ModelUsage.Edit>
      }[keyof Models]['id']
    | (string & {})

/**
 * Available providers for Edit.
 * This is either:
 * - one of the availble options (dotcom)
 * - an unknown `string` (enterprise)
 */
export type EditProvider =
    | {
          [K in keyof Models]: HasUsage<Models[K], ModelUsage.Edit>
      }[keyof Models]['provider']
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
      }[keyof Models]['id']
    | (string & {})

/**
 * Available providers for Chat.
 * This is either:
 * - one of the availble options (dotcom)
 * - an unknown `string` (enterprise)
 */
export type ChatProvider =
    | {
          [K in keyof Models]: HasUsage<Models[K], ModelUsage.Chat>
      }[keyof Models]['provider']
    | (string & {})

export interface ModelContextWindow {
    /**
     * The token limit reserved for chat input.
     */
    input: number
    /**
     * The maximum number of tokens that the model can respond with in a single request.
     */
    output: number
    /**
     * The additional tokens reserved for context.
     * When not defined, context shares the same token limit as input.
     */
    context?: {
        /**
         * The token limit reserved for user-added context.
         * Example: @-mentions.
         */
        user?: number
    }
}
