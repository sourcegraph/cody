export const getEditorRepoFileID = (repoName: string, filePath: string, revision: string) => {
    return `${repoName}-${filePath}-${revision || 'latest'}`
}
