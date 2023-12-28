import { Meta, StoryObj } from '@storybook/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import {
    EmbeddingsEnabledPopup,
    EmbeddingsNotFoundEnterprisePopup,
    EmbeddingsNotFoundPopup,
} from './OnboardingExperimentPopups'

import styles from './Popup.module.css'

const meta: Meta<typeof EmbeddingsEnabledPopup> = {
    title: 'cody/Old Context Status',
    component: EmbeddingsEnabledPopup,
    decorators: [VSCodeStoryDecorator],
}
export default meta

export const EmbeddingsNotFound: StoryObj<typeof EmbeddingsNotFoundPopup> = {
    render: () => (
        <div style={{ background: 'lightgrey', height: '60vh', display: 'flex', alignItems: 'end' }}>
            <button className={styles.popupHost} style={{ width: '32px', height: '24px' }}>
                <EmbeddingsNotFoundPopup isOpen={true} onDismiss={() => {}} reloadStatus={() => {}} />
                <span className="codicon codicon-rocket" />
            </button>
        </div>
    ),
}

export const EmbeddingsNotFoundEnterprise: StoryObj<typeof EmbeddingsNotFoundEnterprisePopup> = {
    render: () => (
        <div style={{ background: 'lightgrey', height: '60vh', display: 'flex', alignItems: 'end' }}>
            <button className={styles.popupHost} style={{ width: '32px', height: '24px' }}>
                <EmbeddingsNotFoundEnterprisePopup isOpen={true} onDismiss={() => {}} reloadStatus={() => {}} />
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
