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
          type: 'edit-file'
          file: string
          diff: string
          diffStat: {
              added: number
              changed: number
              deleted: number
          }
          pending?: boolean
      }
    | {
          type: 'terminal-command'
          cwd?: string
          command: string
          output?: string
          pendingUserApproval?: boolean
      }
    | { type: 'definition'; symbol: string; pending?: boolean }
    | {
          type: 'references'
          symbol: string
          results?: string[]
          repositories?: string[]
          pending?: boolean
      }
    | {
          type: 'message'
          content: string
      }
