import React from 'react'

import { ContextFile, pluralize } from '@sourcegraph/cody-shared'

import { TranscriptAction } from './actions/TranscriptAction'

export interface FileLinkProps {
    path: string
    repoName?: string
    revision?: string
}

export const ContextFiles: React.FunctionComponent<{
    contextFiles: ContextFile[]
    fileLinkComponent: React.FunctionComponent<FileLinkProps>
    className?: string
}> = React.memo(function ContextFilesContent({ contextFiles, fileLinkComponent: FileLink, className }) {
    if (!contextFiles.length) {
        return
    }

    const uniqueFiles = new Set<string>()
    const filteredFiles = contextFiles.filter(file => {
        if (uniqueFiles.has(file.fileName)) {
            return false
        }
        uniqueFiles.add(file.fileName)
        return true
    })

    return (
        <TranscriptAction
            title={{
                verb: 'Enhanced Context',
                object: `${filteredFiles.length} ${pluralize('file', filteredFiles.length)}`,
            }}
            steps={[
                ...filteredFiles.map(file => ({
                    verb: '',
                    object: <FileLink path={file.fileName} repoName={file.repoName} revision={file.revision} />,
                })),
            ]}
            className={className}
        />
    )
})
