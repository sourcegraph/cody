export type TranscriptMessage =
    | { type: 'user'; content?: string }
    | { type: 'agent'; steps: TranscriptAction[] }

export type TranscriptAction =
    | {
          type: 'think'
          content?: string
          pending?: boolean
      }
    | {
          type: 'read-files'
          files: string[]
          pending?: boolean
      }
    | {
          type: 'create-file'
          file: string
          content: string
          pending?: boolean
      }
    | {
          type: 'terminal-command'
          cwd?: string
          command: string
          output?: string
          pendingUserApproval?: boolean
      }
    | {
          type: 'references'
          symbol: string
          results?: string[]
          pending?: boolean
      }
    | {
          type: 'message'
          content: string
      }
