import React from 'react'

import { ContextFile, ContextFileRange } from '@sourcegraph/cody-shared'

import { TranscriptAction } from '../actions/TranscriptAction'

export interface FileLinkProps {
    path: string
    repoName?: string
    revision?: string
    source?: string
    range?: ContextFileRange
}

export const EnhancedContext: React.FunctionComponent<{
    contextFiles: ContextFile[]
    fileLinkComponent: React.FunctionComponent<FileLinkProps>
    className?: string
}> = React.memo(function ContextFilesContent({ contextFiles, fileLinkComponent: FileLink, className }) {
    if (!contextFiles.length) {
        return
    }

    const uniqueFiles = new Set<string>()
    const filteredFiles = contextFiles.filter(file => {
        if (file.source !== 'embeddings') {
            return false
        }
        if (uniqueFiles.has(file.fileName)) {
            return false
        }
        uniqueFiles.add(file.fileName)
        return true
    })

    if (!filteredFiles.length) {
        return
    }

    return (
        <TranscriptAction
            title={{ verb: '✨', object: '', tooltip: 'Files included by Enhanced Context' }}
            steps={filteredFiles?.map(file => ({
                verb: '',
                object: (
                    <FileLink
                        path={file.fileName}
                        repoName={file.repoName}
                        revision={file.revision}
                        source={file.source}
                        range={file.range}
                    />
                ),
            }))}
            className={className}
        />
    )
})
