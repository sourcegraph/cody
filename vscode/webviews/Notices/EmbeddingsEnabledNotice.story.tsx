import { Meta, StoryObj } from '@storybook/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { EmbeddingsEnabledNotice } from './EmbeddingsEnabledNotice'

const meta: Meta<typeof EmbeddingsEnabledNotice> = {
    title: 'cody/App-less Onboarding',
    component: EmbeddingsEnabledNotice,
    decorators: [VSCodeStoryDecorator],
}

export default meta

export const EmbeddingsEnabled: StoryObj<typeof EmbeddingsEnabledNotice> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <EmbeddingsEnabledNotice />
        </div>
    ),
}
