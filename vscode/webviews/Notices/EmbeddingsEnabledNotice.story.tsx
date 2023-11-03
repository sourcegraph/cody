import { Meta, StoryObj } from '@storybook/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { EmbeddingsEnabledNotice } from './EmbeddingsEnabledNotice'

import styles from '../storybook/VSCodeStoryDecorator.module.css'

const meta: Meta<typeof EmbeddingsEnabledNotice> = {
    title: 'cody/App-less Onboarding',
    component: EmbeddingsEnabledNotice,
    decorators: [VSCodeStoryDecorator],
}

export default meta

export const EmbeddingsEnabledToast: StoryObj<typeof EmbeddingsEnabledNotice> = {
    render: () => (
        <div className={styles.testDarkSidebar}>
            <EmbeddingsEnabledNotice />
        </div>
    ),
}
