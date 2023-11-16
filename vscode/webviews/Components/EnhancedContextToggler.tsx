import React, { useCallback, useState } from 'react'

import { VSCodeButton, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { ChatContextStatus } from '@sourcegraph/cody-shared'

import styles from './EnhancedContextToggler.module.css'

export const EnhancedContextToggler: React.FunctionComponent<{
    enhanceContext: boolean
    setEnhanceContext: (arg: boolean) => void
    contextStatus: ChatContextStatus
}> = React.memo(function ChatInputContextContent({ enhanceContext, setEnhanceContext, contextStatus }) {
    const [open, setOpen] = useState(false)

    const onClickHandler = useCallback(
        (option: boolean): void => {
            setEnhanceContext(option)
        },
        [setEnhanceContext]
    )

    return (
        <div className={styles.container}>
            {open && (
                <div className={styles.popUpContainer}>
                    <VSCodeCheckbox
                        className={styles.checkBox}
                        checked={enhanceContext}
                        onChange={e => onClickHandler((e.target as HTMLInputElement).checked)}
                    >
                        Enhanced Context ✨
                    </VSCodeCheckbox>
                    <p className={styles.enhancedContextHelpText}>
                        Automatically include additional context from your codebase {contextStatus.codebase}
                    </p>
                </div>
            )}
            <VSCodeButton
                className={classNames(styles.settingsBtn)}
                appearance="icon"
                type="button"
                onClick={() => setOpen(!open)}
                title="Configure Enhanced Context"
            >
                <i className="codicon codicon-settings" />
            </VSCodeButton>
        </div>
    )
})
