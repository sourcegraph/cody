type ToolSignature<Args, Result, Meta = never> = {
    /**
     * Arguments to the tool, provided by the model.
     */
    args: Args

    /**
     * Information derived from the args, computed by the tool handler.
     *
     * Example: `diffStat` in the `edit-file` tool, which is derived from the args by parsing the
     * diff and computing the diff stat.
     */
    argsMeta: Meta

    result: Result
}

type Tools = {
    'read-files': ToolSignature<{ files: string[] }, string[]>
    'create-file': ToolSignature<{ file: string; content: string }, void>
    'edit-file': ToolSignature<
        { file: string; diff: string },
        void,
        { diffStat: { added: number; changed: number; deleted: number } }
    >
    'terminal-command': ToolSignature<{ cwd?: string; command: string }, string, { output: string }>
    definition: ToolSignature<{ symbol: string }, string>
    references: ToolSignature<{ symbol: string }, string, { repositories: string[] }>
    // TODO!(sqs): need to support arbitrary tools
}
