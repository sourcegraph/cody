import { Meta, StoryObj } from '@storybook/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { InstallCodyAppPopup } from './InstallCodyAppPopup'

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
                <InstallCodyAppPopup />
                <span className="codicon codicon-rocket" />
            </button>
        </div>
    ),
}
