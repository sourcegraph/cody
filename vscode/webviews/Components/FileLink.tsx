import React from 'react'

import { displayPath } from '@sourcegraph/cody-shared'
import { type FileLinkProps } from '@sourcegraph/cody-ui/src/chat/components/EnhancedContext'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import styles from './FileLink.module.css'

export const FileLink: React.FunctionComponent<FileLinkProps> = ({ uri, range, source }) => {
    const pathToDisplay = displayPath(uri)
    const pathWithRange = range?.end.line
        ? `${pathToDisplay}:${range?.start.line + 1}-${range?.end.line - 1}`
        : pathToDisplay

    return (
        <button
            className={styles.linkButton}
            type="button"
            title={source ? `${pathWithRange} included via ${source}` : pathWithRange}
            onClick={() => {
                getVSCodeAPI().postMessage({ command: 'openFile', uri, range })
            }}
        >
            {`@${pathWithRange}`}
        </button>
    )
}
