import type { DEFAULT_DOT_COM_MODELS } from './dotcom'

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

type Models = typeof DEFAULT_DOT_COM_MODELS

/**
 * Extracts model types from the Models type that have
 * the ModelUsage.Edit usage specified.
 */
export type EditModel =
    | {
          [K in keyof Models]: HasUsage<Models[K], ModelUsage.Edit>
      }[keyof Models]['model']
    | (string & {})

export type ChatModel =
    | {
          [K in keyof Models]: HasUsage<Models[K], ModelUsage.Chat>
      }[keyof Models]['model']
    | (string & {})
