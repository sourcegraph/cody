import type { MinionTranscriptItem, PlanStatus, PlanStepsStatus } from '../../src/minion/action'

export type MinionWebviewMessage =
    | {
          type: 'ready'
      }
    | {
          type: 'start'
          description: string
      }
    | {
          type: 'set-session'
          id: string
      }
    | {
          type: 'clear-history'
      }
    | {
          type: 'replay-from-index'
          index: number
      }
    | {
          type: 'cancel-current-block'
      }
    | {
          type: 'update-plan-step'
          blockid: string
          stepid: string
          status: PlanStatus
      }

export type MinionExtensionMessage =
    | {
          type: 'config'
          workspaceFolderUris: string[]
      }
    | {
          type: 'update-session-ids'
          sessionIds: string[]
          currentSessionId?: string
      }
    | {
          type: 'update-transcript'
          transcript: MinionTranscriptItem[]
      }
    | {
          type: 'display-error'
          error: string
      }
    | {
          type: 'update-plan-step-status'
          blockid: string
          stepStatus: PlanStepsStatus
      }
