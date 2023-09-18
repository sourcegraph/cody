import React from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { Popup } from './Popup'

export const InstallCodyAppPopup: React.FunctionComponent<{}> = () => (
    <Popup
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
        onDismiss={() => {}}
    />
)
