import React from 'react'

import type { URI } from 'vscode-uri'

import type { ActiveTextEditorSelectionRange, ContextFile } from '@sourcegraph/cody-shared'

import { TranscriptAction } from '../actions/TranscriptAction'

export const EnhancedContextEnabled: React.Context<boolean> = React.createContext(true)

export function useEnhancedContextEnabled(): boolean {
    return React.useContext(EnhancedContextEnabled)
}

export interface FileLinkProps {
    uri: URI
    repoName?: string
    revision?: string
    source?: string
    range?: ActiveTextEditorSelectionRange
    title?: string
}

export const EnhancedContext: React.FunctionComponent<{
    contextFiles: ContextFile[]
    fileLinkComponent: React.FunctionComponent<FileLinkProps>
    className?: string
    isCommand: boolean
}> = React.memo(function ContextFilesContent({
    contextFiles,
    fileLinkComponent: FileLink,
    className,
    isCommand,
}) {
    if (!contextFiles.length) {
        return
    }

    const uniqueFiles = new Set<string /* uri.toString() */>()

    const filteredFiles = contextFiles.filter(file => {
        if (uniqueFiles.has(file.uri.toString())) {
            return false
        }
        uniqueFiles.add(file.uri.toString())
        return true
    })

    if (!filteredFiles.length) {
        return
    }

    // Enhanced Context are context added by one of Cody's context fetchers.
    // NOTE: sparkle should only be added to messages that use enhanced context.
    // NOTE: Core chat commands (e.g. /explain and /smell) use local context only.
    // Check if the filteredFiles only contain local context (non-enhanced context).
    const localContextType = ['user', 'selection', 'terminal', 'editor']
    const localContextOnly = filteredFiles.every(file => localContextType.includes(file.type))
    const sparkle = localContextOnly || isCommand ? '' : '✨ '
    const prefix = sparkle + 'Context: '
    // It checks if file.range exists first before accessing start and end.
    // If range doesn't exist, it adds 0 lines for that file.
    const lineCount = filteredFiles.reduce(
        (total, file) => total + (file.range ? file.range?.end?.line - file.range?.start?.line + 1 : 0),
        0
    )
    const fileCount = filteredFiles.length
    const lines = `${lineCount} line${lineCount > 1 ? 's' : ''}`
    const files = `${fileCount} file${fileCount > 1 ? 's' : ''}`
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
                        repoName={file.repoName}
                        revision={file.revision}
                        source={file.source}
                        range={file.range}
                        title={file.title}
                    />
                ),
            }))}
            className={className}
        />
    )
})
