import React from 'react'

import { FileLinkProps } from '@sourcegraph/cody-ui/src/chat/components/EnhancedContext'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import styles from './FileLink.module.css'

export const FileLink: React.FunctionComponent<FileLinkProps> = ({ uri, path, range, source }) => {
    const fileName = path || uri?.fsPath
    const pathWithRange = range?.end.line ? `${fileName}:${range?.start.line + 1}-${range?.end.line - 1}` : fileName

    return (
        <button
            className={styles.linkButton}
            type="button"
            title={source ? `${pathWithRange} included via ${source}` : pathWithRange}
            onClick={() => {
                getVSCodeAPI().postMessage({ command: 'openFile', filePath: path, uri, range })
            }}
        >
            {`@${pathWithRange}`}
        </button>
    )
}
