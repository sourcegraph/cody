import type { Meta, StoryObj } from '@storybook/react'
import { App } from './App'
import { VSCodeWebview } from './storybook/VSCodeStoryDecorator'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const meta: Meta<typeof App> = {
    title: 'cody/App',
    component: App,
    decorators: [story => <div style={{ height: '80vh' }}> {story()} </div>, VSCodeWebview],
}

export default meta

export const Loading: StoryObj<typeof meta> = {
    render: () => <App vscodeAPI={dummyVSCodeAPI} />,
}

const dummyVSCodeAPI: VSCodeWrapper = {
    onMessage: () => {
        return () => {}
    },
    postMessage: () => {},
    getState: () => ({}),
    setState: () => {},
}
