import React from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { Popup, PopupOpenProps } from './Popup'

export interface OnboardingPopupProps {
    installApp: () => void
    openApp: () => void
    reloadStatus: () => void
}

export const InstallCodyAppPopup: React.FunctionComponent<
    { repoName: string } & OnboardingPopupProps & PopupOpenProps
> = ({ installApp, isOpen, onDismiss, reloadStatus, repoName }) => (
    <Popup
        isOpen={isOpen}
        onDismiss={onDismiss}
        title="Install Cody App for Embeddings"
        text={`You can increase the quality of Cody's chat and autocomplete by installing the Cody desktop app and indexing this repository (${repoName}).`}
        linkText="Learn more"
        linkHref="https://docs.sourcegraph.com/cody/overview/app"
        actionButtons={
            <>
                <VSCodeButton onClick={installApp}>Install Cody App</VSCodeButton>
                <VSCodeButton onClick={reloadStatus}>Reload</VSCodeButton>
            </>
        }
    />
)

export const EmbeddingsNotFoundPopup: React.FunctionComponent<OnboardingPopupProps & PopupOpenProps> = ({
    isOpen,
    onDismiss,
    openApp,
    reloadStatus,
}) => (
    <Popup
        isOpen={isOpen}
        onDismiss={onDismiss}
        title="Embeddings Not Found"
        text="To enable embeddings, add this repository to Cody App and wait for indexing to complete."
        linkText="Learn more"
        linkHref="https://docs.sourcegraph.com/cody/overview/app#embeddings"
        actionButtons={
            <>
                <VSCodeButton onClick={openApp}>Open App</VSCodeButton>
                <VSCodeButton onClick={reloadStatus}>Reload</VSCodeButton>
            </>
        }
    />
)

export const EmbeddingsNotFoundEnterprisePopup: React.FunctionComponent<OnboardingPopupProps & PopupOpenProps> = ({
    isOpen,
    onDismiss,
    reloadStatus,
}) => (
    <Popup
        isOpen={isOpen}
        onDismiss={onDismiss}
        title="Embeddings Not Found"
        text="This repository does not have Cody embeddings generated."
        linkText="Learn more"
        linkHref="https://docs.sourcegraph.com/cody/explanations/code_graph_context#configuring-embeddings"
        actionButtons={
            <>
                <VSCodeButton onClick={reloadStatus}>Reload</VSCodeButton>
            </>
        }
    />
)

export interface EmbeddingsEnabledPopupProps {
    repoName: string
    indexSource: string
}

export const EmbeddingsEnabledPopup: React.FunctionComponent<EmbeddingsEnabledPopupProps & PopupOpenProps> = ({
    isOpen,
    onDismiss,
    indexSource,
    repoName,
}) => {
    const linkHref =
        indexSource === 'Cody App'
            ? 'https://docs.sourcegraph.com/cody/overview/app#embeddings'
            : 'https://docs.sourcegraph.com/cody/explanations/indexing'
    return (
        <Popup
            isOpen={isOpen}
            onDismiss={onDismiss}
            title="Embeddings Enabled"
            text={`This repository (${repoName}) has been indexed by ${indexSource}.`}
            linkText="Learn more"
            linkHref={linkHref}
        />
    )
}
