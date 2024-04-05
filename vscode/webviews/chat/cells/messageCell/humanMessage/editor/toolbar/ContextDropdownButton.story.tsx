import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../../../../../../storybook/VSCodeStoryDecorator'
import { ContextSettings } from './ContextDropdownButton'
import styles from './ContextDropdownButton.module.css'

const meta: Meta<typeof ContextSettings> = {
    title: 'cody/ContextSettings',
    component: ContextSettings,
    decorators: [
        story => <div style={{ width: '400px', maxHeight: 'max(300px, 80vh)' }}>{story()}</div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        className: styles.popover,
    },
}

export default meta

type Story = StoryObj<typeof ContextSettings>

export const Default: Story = {
    args: {},
}
