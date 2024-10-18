import type { Meta, StoryObj } from '@storybook/react'
import { App } from './App'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import { View } from './tabs'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const meta: Meta<typeof App> = {
    title: 'cody/App',
    component: App,
    decorators: [story => <div style={{ height: '80vh' }}> {story()} </div>, VSCodeWebview],
}

export default meta

export const Simple: StoryObj<typeof meta> = {
    render: () => <App vscodeAPI={dummyVSCodeAPI} />,
}

const dummyVSCodeAPI: VSCodeWrapper = {
    onMessage: cb => {
        // Send initial message so that the component is fully rendered.
        if (firstTime) {
            cb({ type: 'view', view: View.Chat })
            firstTime = false
        }
        return () => {}
    },
    postMessage: () => {},
    getState: () => ({}),
    setState: () => {},
}

let firstTime = true
