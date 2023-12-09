import { useState } from 'react'

import { mdiDatabaseCheckOutline, mdiDatabaseOffOutline, mdiDatabaseRemoveOutline } from '@mdi/js'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'
import { URI } from 'vscode-uri'

import { ChatContextStatus } from '@sourcegraph/cody-shared'
import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { formatFilePath } from '@sourcegraph/cody-ui/src/chat/inputContext/ChatInputContext'
import { Icon } from '@sourcegraph/cody-ui/src/utils/Icon'

import {
    EmbeddingsEnabledPopup,
    EmbeddingsNotFoundEnterprisePopup,
    EmbeddingsNotFoundPopup,
    OnboardingPopupProps,
} from './Popups/OnboardingExperimentPopups'
import { Popup, PopupOpenProps } from './Popups/Popup'

import styles from './ChatInputContextSimplified.module.css'
import popupStyles from './Popups/Popup.module.css'

export interface ChatInputContextSimplifiedProps {
    contextStatus?: ChatContextStatus
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
        reloadStatus: () => {},
    }
    return (
        <VSCodeButton
            appearance="icon"
            className={classNames(styles.codebase, popupStyles.popupHost)}
            onClick={togglePopup}
        >
            <Icon svgPath={icon} className={classNames(styles.codebaseIcon, iconClassName)} />
            {popup?.({ isOpen: !!popupOpen, onDismiss: () => togglePopup?.(), ...onboardingPopupProps })}
        </VSCodeButton>
    )
}

export const ChatInputContextSimplified: React.FC<ChatInputContextSimplifiedProps> = ({
    contextStatus,
    onboardingPopupProps,
}) => {
    const [popupOpen, setPopupOpen] = useState<boolean>(false)
    const togglePopup = (): void => setPopupOpen(!popupOpen)
    let codebaseState: React.ReactNode
    if (!contextStatus?.codebase) {
        // No codebase
        const popup: React.FC<OnboardingPopupProps & PopupOpenProps> = ({ isOpen, onDismiss }) => (
            <Popup
                isOpen={isOpen}
                onDismiss={onDismiss}
                title="No Repository Found"
                text="Open a git repository that has a remote to enable embeddings."
                linkText=""
                linkHref=""
            />
        )

        codebaseState = (
            <CodebaseState
                icon={mdiDatabaseOffOutline}
                popup={popup}
                popupOpen={popupOpen}
                togglePopup={togglePopup}
                onboardingPopupProps={onboardingPopupProps}
            />
        )
    } else if (contextStatus?.codebase && !contextStatus?.embeddingsEndpoint) {
        // Codebase, but no embeddings
        const isEnterprise = contextStatus?.endpoint !== DOTCOM_URL.href
        let popup: React.FC<OnboardingPopupProps & PopupOpenProps>
        if (isEnterprise) {
            popup = EmbeddingsNotFoundEnterprisePopup
        } else {
            popup = EmbeddingsNotFoundPopup
        }
        codebaseState = (
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
    } else if (contextStatus?.codebase && contextStatus?.embeddingsEndpoint) {
        // Codebase and embeddings
        // TODO: Add a widget indicating when "app-less" local embeddings are
        // available.
        const repoName = contextStatus.codebase
        const indexSource = URI.parse(contextStatus.embeddingsEndpoint).authority
        const popup: React.FC<OnboardingPopupProps & PopupOpenProps> = ({ isOpen, onDismiss }) => (
            <EmbeddingsEnabledPopup
                isOpen={isOpen}
                onDismiss={onDismiss}
                repoName={repoName}
                indexSource={indexSource}
            />
        )
        codebaseState = (
            <CodebaseState
                codebase={contextStatus.codebase}
                icon={mdiDatabaseCheckOutline}
                popup={popup}
                popupOpen={popupOpen}
                togglePopup={togglePopup}
            />
        )
    }
    return (
        <div className={styles.container}>
            {codebaseState}
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
