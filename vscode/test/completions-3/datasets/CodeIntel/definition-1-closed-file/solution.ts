import { getEditorRepoFileID } from './api'

const repository = {
    name: 'sourcegraph/sourcegraph',
    url: 'https://github.com/sourcegraph/sourcegraph',
    commit: {
        oid: 'deadbeef',
    },
    file: {
        path: 'index.ts',
        content: '// Hello world!',
    },
}
export const getRepoId = () => {
    return getEditorRepoFileID({
        fileContent: repository.file.content,
        filePath: repository.file.path,
        repoName: repository.name,
        revision: repository.commit.oid,
    })
}
