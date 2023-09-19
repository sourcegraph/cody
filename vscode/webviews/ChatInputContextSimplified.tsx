import { useState } from 'react'

import { mdiDatabaseCheckOutline, mdiDatabaseOffOutline, mdiDatabaseRemoveOutline } from '@mdi/js'
import classNames from 'classnames'

import { ChatContextStatus } from '@sourcegraph/cody-shared'
import { formatFilePath } from '@sourcegraph/cody-ui/src/chat/inputContext/ChatInputContext'
import { Icon } from '@sourcegraph/cody-ui/src/utils/Icon'

import { EmbeddingsNotFoundPopup, InstallCodyAppPopup, OnboardingPopupProps } from './Popups/OnboardingExperimentPopups'
import { PopupOpenProps } from './Popups/Popup'

import styles from './ChatInputContextSimplified.module.css'
import popupStyles from './Popups/Popup.module.css'

export interface ChatInputContextSimplifiedProps {
    contextStatus: ChatContextStatus
    isAppInstalled: boolean
    onboardingPopupProps: OnboardingPopupProps
}

const CodebaseState: React.FunctionComponent<{
    iconClassName?: string
    icon: string
    codebase?: string
    popup?: React.FC<OnboardingPopupProps & PopupOpenProps>
    popupOpen?: boolean
    togglePopup?: () => void
    onboardingPopupProps?: OnboardingPopupProps
}> = ({ iconClassName, icon, popup, popupOpen, togglePopup, onboardingPopupProps }) => {
    onboardingPopupProps ||= {
        openApp: () => {},
        installApp: () => {},
        reloadStatus: () => {},
    }
    // TODO: Make this a button, not a H3
    return (
        <h3 className={classNames(styles.codebase, popupStyles.popupHost)} onClick={togglePopup}>
            <Icon svgPath={icon} className={classNames(styles.codebaseIcon, iconClassName)} />
            {popup?.({ isOpen: !!popupOpen, onDismiss: () => togglePopup?.(), ...onboardingPopupProps })}
        </h3>
    )
}

// This is a fork of ChatInputContext with extra UI for simplified "App-less"
// Onboarding. Note, it is just the onboarding that's simplified: This component
// has *more* UI to guide users through the app setup steps they skipped during
// the simplified onboarding flow.
export const ChatInputContextSimplified: React.FC<ChatInputContextSimplifiedProps> = ({
    contextStatus,
    isAppInstalled,
    onboardingPopupProps,
}) => {
    const [popupOpen, setPopupOpen] = useState<boolean>(false)
    const togglePopup = (): void => setPopupOpen(!popupOpen)
    return (
        <div className={styles.container}>
            {contextStatus.codebase ? (
                contextStatus.mode && contextStatus.connection ? (
                    <CodebaseState codebase={contextStatus.codebase} icon={mdiDatabaseCheckOutline} />
                ) : (
                    <CodebaseState
                        codebase={contextStatus.codebase}
                        icon={mdiDatabaseRemoveOutline}
                        iconClassName={styles.errorColor}
                        popup={isAppInstalled ? EmbeddingsNotFoundPopup : InstallCodyAppPopup}
                        popupOpen={popupOpen}
                        togglePopup={togglePopup}
                        onboardingPopupProps={onboardingPopupProps}
                    />
                )
            ) : (
                <CodebaseState icon={mdiDatabaseOffOutline} iconClassName={styles.errorColor} />
            )}
            {(contextStatus.filePath && (
                <p className={styles.file} title={contextStatus.filePath}>
                    {formatFilePath(contextStatus.filePath, contextStatus.selectionRange)}
                </p>
            )) || (
                <p className={styles.file} title={contextStatus.filePath}>
                    No file selected
                </p>
            )}
        </div>
    )
}
