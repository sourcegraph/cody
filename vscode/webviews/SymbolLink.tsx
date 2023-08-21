import React from 'react'

import { SymbolLinkProps } from '@sourcegraph/cody-ui/src/chat/PreciseContext'

import { getVSCodeAPI } from './utils/VSCodeApi'

import styles from './SymbolLink.module.css'

export const SymbolLink: React.FunctionComponent<SymbolLinkProps> = ({ symbol, path, range }) => (
    <button
        className={styles.linkButton}
        type="button"
        onClick={() => {
            getVSCodeAPI().postMessage({
                command: 'openLocalFileWithRange',
                filePath: path,
                range,
            })
        }}
        title={symbol}
    >
        {symbol}
    </button>
)
