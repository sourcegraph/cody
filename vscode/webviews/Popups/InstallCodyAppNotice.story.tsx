import { Meta, StoryObj } from '@storybook/react'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { InstallCodyAppNotice } from './InstallCodyAppNotice'

import styles from './InstallCodyAppNotice.module.css'

const meta: Meta<typeof InstallCodyAppNotice> = {
    title: 'cody/App-less Onboarding',
    component: InstallCodyAppNotice,
    decorators: [VSCodeStoryDecorator],
}

export default meta

export const InstallCodyApp: StoryObj<typeof InstallCodyAppNotice> = {
    render: () => (
        <div style={{ background: 'lightgrey', height: '60vh', display: 'flex', alignItems: 'end' }}>
            <button className={styles.popupHost} style={{ width: '24px', height: '24px' }}>
                <InstallCodyAppNotice
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
                <span className="codicon codicon-rocket" />
            </button>
        </div>
    ),
}
