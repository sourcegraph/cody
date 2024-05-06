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

export interface Step {
    title: string
    description: string
}

export type ActionL1 = { level: 1 } & (
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
          description: string
      }
)

export type ActionL0 = { level: 0 } & (
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
          steps: Step[]
      }
    | {
          type: 'do-step'
          step: Step
          ordinal: number
          subactions: ActionL1[]
      }
)

export type Action = ActionL0 | ActionL1

export type ActionStatus = 'pending' | 'in-progress' | 'stopped' | 'completed' | 'failed'
