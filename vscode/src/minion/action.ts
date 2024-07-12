import type { RangeData } from '@sourcegraph/cody-shared'
import type { URI } from 'vscode-uri'

export interface AnnotatedContext {
    text: string
    source: {
        uri: URI
        range: RangeData
    }
    comment: string
}

export type PlanStatus = 'todo' | 'done' | 'running' | 'run-disabled'

export type PlanStepsStatus = {
    [stepid: string]: {
        status: PlanStatus
        acts: string[]
    }
}

export interface Step {
    stepId: string
    title: string
    description: string
}

export type EventL1 = { level: 1 } & (
    | {
          type: 'search'
          query: string
          results: string[]
      }
    | {
          type: 'open'
          file: string
      }
    | {
          type: 'scroll'
          direction: 'up' | 'down'
      }
    | {
          type: 'edit'
          file: string
          start: number
          end: number
          replacement: string
      }
    | {
          type: 'bash'
          command: string
          output: string
      }
    | {
          type: 'human'
          actionType: 'edit' | 'view'
          description: string
      }
)

export type EventL0 = { level: 0 } & (
    | {
          type: 'restate'
          output: string
      }
    | {
          type: 'contextualize'
          output: AnnotatedContext[]
      }
    | {
          type: 'reproduce'
          bash?: string
      }
    | {
          type: 'plan'
          blockid: string
          steps: Step[]
      }
    | {
          type: 'describe'
          description: string
      }
)

export type EventL0Type = EventL0['type']

export type Event = EventL0 | EventL1

export type EventStatus = 'pending' | 'in-progress' | 'stopped' | 'completed' | 'failed'

export interface MinionSession {
    id: string
    transcript: MinionTranscriptItem[]
}

export type BlockStatus = 'doing' | 'done' | 'cancelled' | 'failed'

export type MinionTranscriptItem = MinionTranscriptEvent | MinionTranscriptBlock

export type MinionTranscriptBlock = {
    type: 'block'
    block: { nodeid: string; blockid: string }
    status: BlockStatus
}

export type MinionTranscriptEvent = {
    type: 'event'
    event: Event
}
