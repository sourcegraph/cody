import type { CommentArray } from 'comment-json'

export type KeybindingsContent = CommentArray<Record<string, string>> | null | undefined
