interface InitializeParams {}
interface Position {
    line: number
    character: number
}
interface Range {
    start: Position
    end: Position
}

interface Location {
    uri: string
    range: Range
}

interface Excerpt {
    languageId: string
    code: string
}

interface BlazeGraph {
    // Requests
    initialize(params: InitializeParams): Promise<void>
    shutdown(params: null): Promise<void>

    excerpts(params: Location): Promise<Excerpt[]>

    // Notifications
    gitRepositoryDidOpen(uri: string): void
    gitRevisionDidChange(uri: string): void
}
