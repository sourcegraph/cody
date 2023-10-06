export const getEditorRepoFileID = (repoName: string, filePath: string, revision: string) => {
    return `${repoName}-${filePath}-${revision || 'latest'}`
}

const repository = {
    name: 'sourcegraph/sourcegraph',
    url: 'https://github.com/sourcegraph/sourcegraph',
    commit: {
        oid: 'deadbeef',
    },
    file: {
        path: 'index.ts',
        content: '// Hello world!',
    }
}

export const getRepoId = () => {
    return getEditorRepoFileID(◆
}

