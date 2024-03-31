import type React from 'react'

import type { ContextItem } from '@sourcegraph/cody-shared'

import { FileLink } from '../../Components/FileLink'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { TranscriptAction } from '../actions/TranscriptAction'

export const EnhancedContext: React.FunctionComponent<{
    contextFiles: ContextItem[]
    className?: string
}> = ({ contextFiles, className }) => {
    if (!contextFiles.length) {
        return
    }

    const usedContext = []
    const excludedAtContext = []
    for (const f of contextFiles) {
        if (f.type === 'file' && f.source === 'user' && f.isTooLarge) {
            excludedAtContext.push(f)
        } else {
            usedContext.push(f)
        }
    }

    const prefix = 'Context: '
    // It checks if file.range exists first before accessing start and end.
    // If range doesn't exist, it adds 0 lines for that file.
    const lineCount = usedContext.reduce(
        (total, file) =>
            total +
            (file.range
                ? // Don't count a line with no characters included (character == 0).
                  (file.range.end.character === 0 ? file.range.end.line - 1 : file.range.end.line) -
                  file.range.start?.line +
                  1
                : 0),
        0
    )
    const fileCount = new Set(usedContext.map(file => file.uri.toString())).size
    const lines = `${lineCount} line${lineCount > 1 ? 's' : ''}`
    const files = `${fileCount} file${fileCount > 1 ? 's' : ''}`
    let title = lineCount ? `${lines} from ${files}` : `${files}`
    if (excludedAtContext.length) {
        const excludedAtUnit = excludedAtContext.length === 1 ? 'mention' : 'mentions'
        title = `${title} - ⚠️ ${excludedAtContext.length} ${excludedAtUnit} excluded`
    }

    function logContextOpening() {
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:chat:context:opened',
            properties: {
                lineCount,
                fileCount,
                excludedAtContext: excludedAtContext.length,
            },
        })
    }

    return (
        <TranscriptAction
            title={{
                verb: prefix + title,
                object: '',
                tooltip: 'Related code automatically included as context',
            }}
            steps={contextFiles?.map(file => ({
                verb: '',
                object: (
                    <FileLink
                        uri={file.uri}
                        repoName={file.repoName}
                        revision={file.revision}
                        source={file.source}
                        range={file.range}
                        title={file.title}
                        isTooLarge={file.type === 'file' && file.isTooLarge && file.source === 'user'}
                    />
                ),
            }))}
            onClick={logContextOpening}
            className={className}
        />
    )
}
