import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'

import { CodyIDE } from '@sourcegraph/cody-shared'
import { VersionUpdatedNotice } from './VersionUpdatedNotice'

const meta: Meta<typeof VersionUpdatedNotice> = {
    title: 'cody/Notices/VersionUpdatedNotice',
    component: VersionUpdatedNotice,
    decorators: [
        story => {
            localStorage.removeItem('notices.last-dismissed-version')
            return story()
        },
        VSCodeStandaloneComponent,
    ],
    args: {
        probablyNewInstall: false,
        IDE: CodyIDE.VSCode,
        version: '1.2.3',
    },
}

export default meta

type Story = StoryObj<typeof VersionUpdatedNotice>

export const Default: Story = {}

export const NewInstall: Story = {
    args: {
        probablyNewInstall: true,
    },
}

export const vscodeNightly: Story = {
    args: {
        IDE: CodyIDE.VSCode,
        version: '2.1.0',
    },
}

export const JetbrainsStable: Story = {
    args: {
        IDE: CodyIDE.JetBrains,
        version: '1.2.3',
    },
}

export const JetbrainsNightly: Story = {
    args: {
        IDE: CodyIDE.JetBrains,
        version: '6.5.4321-nightly',
    },
}

export const RestartButton: Story = {
    args: {
        showRestart: true,
    },
}
