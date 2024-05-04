import type { Action } from '../../src/minion/action'

export type MinionWebviewMessage =
    | {
          type: 'ready'
      }
    | {
          type: 'start'
          description: string
      }
    | {
          type: 'ask-action-reply'
          id: string
          action: Action
          error?: string
      }

export type MinionExtensionMessage =
    | {
          type: 'update-actions'
          actions: Action[]
      }
    | {
          type: 'display-error'
          error: string
      }
    | {
          type: 'ask-action'
          id: string
          action: Action
      }
