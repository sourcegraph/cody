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
    contextStatus?: ChatContextStatus
    isAppInstalled: boolean
    onboardingPopupProps: OnboardingPopupProps
    repoName: string
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
    return (
        <button type="button" className={classNames(styles.codebase, popupStyles.popupHost)} onClick={togglePopup}>
            <Icon svgPath={icon} className={classNames(styles.codebaseIcon, iconClassName)} />
            {popup?.({ isOpen: !!popupOpen, onDismiss: () => togglePopup?.(), ...onboardingPopupProps })}
        </button>
    )
}

function EmbeddingsNotFoundPopupShim(): React.FC<PopupOpenProps> {
    return ({ popupOpenProps }) => (
        <EmbeddingsNotFoundPopup onboardingPopupProps={onboardingOpenProps} popupOpenProps={popupOpenProps} />
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
    const connectionHasEmbeddings = contextStatus?.mode && contextStatus?.connection
    let popup: React.FC<OnboardingPopupProps & PopupOpenProps> | undefined
    if (contextStatus?.codebase && !connectionHasEmbeddings) {
        popup = isAppInstalled ? EmbeddingsNotFoundPopup : InstallCodyAppPopup
    }
    return (
        <div className={styles.container}>
            {contextStatus?.codebase ? (
                connectionHasEmbeddings ? (
                    // Codebase and embeddings
                    <CodebaseState codebase={contextStatus.codebase} icon={mdiDatabaseCheckOutline} />
                ) : (
                    // Codebase, but no embeddings
                    <CodebaseState
                        codebase={contextStatus.codebase}
                        icon={mdiDatabaseRemoveOutline}
                        iconClassName={styles.errorColor}
                        popup={popup}
                        popupOpen={popupOpen}
                        togglePopup={togglePopup}
                        onboardingPopupProps={onboardingPopupProps}
                    />
                )
            ) : (
                // No codebase
                <CodebaseState icon={mdiDatabaseOffOutline} />
            )}
            {contextStatus?.filePath ? (
                <p className={styles.file} title={contextStatus.filePath}>
                    {formatFilePath(contextStatus.filePath, contextStatus.selectionRange)}
                </p>
            ) : (
                <p className={styles.file}>No file selected</p>
            )}
        </div>
    )
}
