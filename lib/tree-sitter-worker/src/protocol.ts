export interface ParseRequest {
    id: string
    code: string
    language: string
}

export interface ParseResponse {
    id: string
    tree: string
}
