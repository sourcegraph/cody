import * as React from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { PopupFrame } from '../Popups/Popup'

import popupStyles from '../Popups/Popup.module.css'
import styles from './ResponseSettings.module.css'

interface ResponseSettingsProps {
    isOpen: boolean
    setOpen: (open: boolean) => void
}

export const ResponseSettings: React.FunctionComponent<ResponseSettingsProps> = ({
    isOpen,
    setOpen,
}): React.ReactNode => {
    const onDismiss = React.useCallback(() => {
        setOpen(false)
    }, [setOpen])

    const onSettingsClick = React.useCallback(() => {
        setOpen(true)
    }, [setOpen])

    return (
        <div className={classNames(popupStyles.popupHost)}>
            <PopupFrame
                isOpen={isOpen}
                onDismiss={onDismiss}
                classNames={[popupStyles.popupTrail, styles.popup]}
            >
                Settings go here
            </PopupFrame>
            <VSCodeButton
                className={classNames(styles.settingsBtn)}
                appearance="icon"
                type="button"
                title="Response Settings"
                onClick={onSettingsClick}
            >
                <i className="codicon codicon-symbol-color" />
            </VSCodeButton>
        </div>
    )
}
