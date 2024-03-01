import type React from 'react'

import type { SymbolLinkProps } from './chat/PreciseContext'

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
                range: {
                    start: { line: range?.startLine ?? 0, character: range?.startCharacter ?? 0 },
                    end: { line: range?.endLine ?? 0, character: range?.endCharacter ?? 0 },
                },
            })
        }}
        title={symbol}
    >
        {symbol}
    </button>
)
