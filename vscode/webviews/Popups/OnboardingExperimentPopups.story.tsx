import { Meta, StoryObj } from '@storybook/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { EmbeddingsEnabledPopup, EmbeddingsNotFoundPopup, InstallCodyAppPopup } from './OnboardingExperimentPopups'

import styles from './Popup.module.css'

const meta: Meta<typeof InstallCodyAppPopup> = {
    title: 'cody/App-less Onboarding',
    component: InstallCodyAppPopup,
    decorators: [VSCodeStoryDecorator],
}

export default meta

export const InstallCodyApp: StoryObj<typeof InstallCodyAppPopup> = {
    render: () => (
        <div style={{ background: 'lightgrey', height: '60vh', display: 'flex', alignItems: 'end' }}>
            <button className={styles.popupHost} style={{ width: '32px', height: '24px' }}>
                <InstallCodyAppPopup
                    isOpen={true}
                    installApp={() => {}}
                    onDismiss={() => {}}
                    openApp={() => {}}
                    reloadStatus={() => {}}
                    repoName="host.example/alice/portscan"
                />
                <span className="codicon codicon-rocket" />
            </button>
        </div>
    ),
}

export const EmbeddingsNotFound: StoryObj<typeof EmbeddingsNotFoundPopup> = {
    render: () => (
        <div style={{ background: 'lightgrey', height: '60vh', display: 'flex', alignItems: 'end' }}>
            <button className={styles.popupHost} style={{ width: '32px', height: '24px' }}>
                <EmbeddingsNotFoundPopup
                    isOpen={true}
                    installApp={() => {}}
                    onDismiss={() => {}}
                    openApp={() => {}}
                    reloadStatus={() => {}}
                />
                <span className="codicon codicon-rocket" />
            </button>
        </div>
    ),
}

export const EmbeddingsEnabledWithApp: StoryObj<typeof EmbeddingsEnabledPopup> = {
    render: () => (
        <div style={{ background: 'lightgrey', height: '60vh', display: 'flex', alignItems: 'end' }}>
            <button className={styles.popupHost} style={{ width: '32px', height: '24px' }}>
                <EmbeddingsEnabledPopup
                    isOpen={true}
                    onDismiss={() => {}}
                    indexSource="Cody App"
                    repoName="host.example/alice/portscan"
                />
                <span className="codicon codicon-rocket" />
            </button>
        </div>
    ),
}

export const EmbeddingsEnabledWithDotcom: StoryObj<typeof EmbeddingsEnabledPopup> = {
    render: () => (
        <div style={{ background: 'lightgrey', height: '60vh', display: 'flex', alignItems: 'end' }}>
            <button className={styles.popupHost} style={{ width: '32px', height: '24px' }}>
                <EmbeddingsEnabledPopup
                    isOpen={true}
                    onDismiss={() => {}}
                    indexSource="sourcegraph.com"
                    repoName="host.example/alice/portscan"
                />
                <span className="codicon codicon-rocket" />
            </button>
        </div>
    ),
}
