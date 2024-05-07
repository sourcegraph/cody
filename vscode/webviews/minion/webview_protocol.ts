import type { Action, ActionStatus } from '../../src/minion/action'

export type MinionWebviewMessage =
    | {
          type: 'ready'
      }
    | {
          type: 'start'
          description: string
      }
    | {
          type: 'propose-next-action-reply'
          id: string
          action: Action
          error?: string
      }

export type MinionExtensionMessage =
    | {
          type: 'config'
          workspaceFolderUris: string[]
      }
    | {
          type: 'update-actions'
          actions: Action[]
      }
    | {
          type: 'display-error'
          error: string
      }
    | {
          type: 'propose-next-action'
          id: string
          action: Action
      }
    | {
          type: 'update-next-action'
          nextAction: {
              action: Action
              status: Exclude<ActionStatus, 'pending' | 'completed'>
              message: string
          } | null
      }
