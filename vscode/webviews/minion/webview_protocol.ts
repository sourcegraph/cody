import type { Action } from '../../src/minion/action'

export type MinionWebviewMessage =
    | {
          type: 'ready'
      }
    | {
          type: 'start'
          description: string
      }

export type MinionExtensionMessage = {
    type: 'update-actions'
    actions: Action[]
}
