interface EditorConfig {
    fileContent: string
    filePath: string
    repoName?: string
    revision?: string
}

export const getEditorRepoFileID = (config: EditorConfig) => {
    return `${config.repoName}-${config.filePath}-${config.revision || 'latest'}`
}
