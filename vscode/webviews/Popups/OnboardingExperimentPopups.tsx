import React from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { Popup, PopupOpenProps } from './Popup'

export const InstallCodyAppPopup: React.FunctionComponent<PopupOpenProps> = ({ isOpen, onDismiss }) => (
    <Popup
        isOpen={isOpen}
        onDismiss={onDismiss}
        title="Install Cody App for Embeddings"
        text="You can increase the quality of Cody's chat and autocomplete by installing the Cody desktop app."
        linkText="Learn more"
        linkHref="https://docs.sourcegraph.com/cody/overview/app"
        actionButtons={
            <>
                <VSCodeButton>Install Cody App</VSCodeButton>
                <VSCodeButton>Reload</VSCodeButton>
            </>
        }
    />
)

export const EmbeddingsNotFoundPopup: React.FunctionComponent<PopupOpenProps> = ({ isOpen, onDismiss }) => (
    <Popup
        isOpen={isOpen}
        onDismiss={onDismiss}
        title="Embeddings Not Found"
        text="To enable embeddings, add this repository to Cody App and wait for indexing to complete."
        linkText="Learn more"
        linkHref="https://docs.sourcegraph.com/cody/overview/app"
        actionButtons={
            <>
                <VSCodeButton>Open App</VSCodeButton>
                <VSCodeButton>Reload</VSCodeButton>
            </>
        }
    />
)
