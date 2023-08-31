export interface ContextInspectorRecord {
    // TODO: Multi-repo support
    file: string
    includedSourceText: string // A substring of the source file
    text: string // The formatted text to contribute to the prompt
    // TODO: Add a reason for why context was added
}
