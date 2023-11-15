import React from 'react'

import { ActiveTextEditorSelectionRange, ContextFile } from '@sourcegraph/cody-shared'

import { TranscriptAction } from '../actions/TranscriptAction'

export interface FileLinkProps {
    path: string
    repoName?: string
    revision?: string
    source?: string
    range?: ActiveTextEditorSelectionRange
}

const enhancedContextSources = new Set(['embeddings', 'keyword', 'symf', 'filename'])

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
        if (uniqueFiles.has(file.fileName) || !file.source) {
            return false
        }
        if (!enhancedContextSources.has(file.source)) {
            return false
        }
        uniqueFiles.add(file.fileName)
        return true
    })

    if (!filteredFiles.length) {
        return
    }

    const lines = filteredFiles.reduce(
        (total, file) =>
            total + (file.range?.end?.line || 0) - (file.range?.start?.line || file.range?.end?.line || 0) + 1,
        0
    )
    const files = filteredFiles.length

    return (
        <TranscriptAction
            title={{
                verb: `✨ ${lines} lines from ${files} files`,
                object: '',
                tooltip: 'Related code automatically included as context',
            }}
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
