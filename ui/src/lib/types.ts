export type TranscriptMessage =
    | { type: 'user'; content?: string }
    | { type: 'agent'; steps: TranscriptAction[] }

export type TranscriptAction =
    | {
          type: 'think'
          content: string
          pending?: boolean
      }
    | {
          type: 'message'
          content: string
      }
