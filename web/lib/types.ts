export interface Repository {
    id: string
    name: string
}

export type InitialContext = {
    repository: Repository
    isDirectory: boolean
    fileURL: string | null
    fileRange: { startLine: number; endLine: number } | null
}
