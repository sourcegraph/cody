import React, { useCallback } from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import styles from './EnhancedContextToggler.module.css'

export const EnhancedContextToggler: React.FunctionComponent<{
    disabled: boolean
    enhanceContext: boolean
    setEnhanceContext: (arg: boolean) => void
}> = React.memo(function ChatInputContextContent({ disabled, enhanceContext, setEnhanceContext }) {
    const onClickHandler = useCallback((): void => {
        setEnhanceContext(!enhanceContext)
    }, [enhanceContext, setEnhanceContext])

    if (disabled) {
        return (
            <VSCodeButton
                className={classNames(styles.title, styles.disabled)}
                appearance="icon"
                title="Start a new chat to ask new questions with enhanced context attached."
                disabled={true}
            >
                <i className="codicon codicon-circle-slash" />
            </VSCodeButton>
        )
    }

    return (
        <VSCodeButton
            className={classNames(styles.title, !enhanceContext && styles.disabled)}
            appearance="icon"
            type="button"
            onClick={() => onClickHandler()}
            title={`Enhanced Context ${enhanceContext ? 'Enabled' : 'Disabled'}`}
        >
            <i className={enhanceContext ? 'codicon codicon-pass-filled' : 'codicon codicon-pass'} />
        </VSCodeButton>
    )
})
