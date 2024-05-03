import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'

import { getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { ModelSelectField } from './ModelSelectField'

const meta: Meta<typeof ModelSelectField> = {
    title: 'cody/ModelSelectField',
    component: ModelSelectField,
    decorators: [
        story => <div style={{ width: '400px', maxHeight: 'max(300px, 80vh)' }}> {story()} </div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        models: getDotComDefaultModels(),
        onModelSelect: () => {},
        disabled: false,
        __storybook__open: true,
    },
}

export default meta

type Story = StoryObj<typeof ModelSelectField>

export const FreeUser: Story = {
    args: {
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
    },
}

export const ProUser: Story = {
    args: {
        userInfo: {
            isDotComUser: true,
            isCodyProUser: true,
        },
    },
}

export const EnterpriseUser: Story = {
    args: {
        userInfo: {
            isDotComUser: false,
            isCodyProUser: false,
        },
    },
}
