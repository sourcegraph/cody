import React from 'react'

import { URI } from 'vscode-uri'

import { ActiveTextEditorSelectionRange, ContextFile } from '@sourcegraph/cody-shared'

import { TranscriptAction } from '../actions/TranscriptAction'

export interface FileLinkProps {
    uri?: URI
    path: string
    repoName?: string
    revision?: string
    source?: string
    range?: ActiveTextEditorSelectionRange
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
        if (uniqueFiles.has(file.fileName)) {
            return false
        }
        // Skip files added by user. e.g. @-files
        if (file.source === 'user') {
            return false
        }
        uniqueFiles.add(file.fileName)
        return true
    })

    if (!filteredFiles.length) {
        return
    }

    const prefix = '✨ Context: '
    // It checks if file.range exists first before accessing start and end.
    // If range doesn't exist, it adds 0 lines for that file.
    const lineCount = filteredFiles.reduce(
        (total, file) => total + (file.range ? file.range?.end?.line - file.range?.start?.line + 1 : 0),
        0
    )
    const fileCount = filteredFiles.length
    const lines = `${lineCount} line` + (lineCount > 1 ? 's' : '')
    const files = `${fileCount} file` + (fileCount > 1 ? 's' : '')
    const title = lineCount ? `${lines} from ${files}` : `${files}`

    return (
        <TranscriptAction
            title={{
                verb: prefix + title,
                object: '',
                tooltip: 'Related code automatically included as context',
            }}
            steps={filteredFiles?.map(file => ({
                verb: '',
                object: (
                    <FileLink
                        uri={file.uri}
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
