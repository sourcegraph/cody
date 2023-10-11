export const getEditorRepoFileID = (config: {
    filePath: string
    repoName?: string
    revision?: string
}) => {
    return `${config.repoName}-${config.filePath}-${config.revision || 'latest'}`
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
    return getEditorRepoFileID(█
}

