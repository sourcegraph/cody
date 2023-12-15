import React from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { Popup, PopupOpenProps } from './Popup'

export interface OnboardingPopupProps {
    reloadStatus: () => void
}

export const EmbeddingsNotFoundPopup: React.FunctionComponent<OnboardingPopupProps & PopupOpenProps> = ({
    isOpen,
    onDismiss,
}) => (
    <Popup
        isOpen={isOpen}
        onDismiss={onDismiss}
        title="Embeddings Not Found"
        text="No embeddings index was found for this repository."
        linkText="Learn more"
        linkHref="https://sourcegraph.com/docs/cody/explanations/indexing"
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
        linkHref="https://sourcegraph.com/docs/cody/explanations/code_graph_context#configuring-embeddings"
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
    return (
        <Popup
            isOpen={isOpen}
            onDismiss={onDismiss}
            title="Embeddings Enabled"
            text={`This repository (${repoName}) has been indexed by ${indexSource}.`}
            linkText="Learn more"
            linkHref="https://sourcegraph.com/docs/cody/explanations/indexing"
        />
    )
}
