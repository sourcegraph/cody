export const getEditorRepoFileID = (config: { filePath: string; repoName?: string; revision?: string }) => {
    return `${config.repoName}-${config.filePath}-${config.revision || 'latest'}`
}
