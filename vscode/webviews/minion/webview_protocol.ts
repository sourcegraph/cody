import type { Action } from './action'

export type MinionWebviewMessage =
    | {
          type: 'ready'
      }
    | {
          type: 'start'
          description: string
      }

export type MinionExtensionMessage = {
    type: 'action'
    action: Action
}
