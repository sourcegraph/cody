import { Meta, StoryObj } from '@storybook/react'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'

import { InstallCodyAppNotice } from './InstallCodyAppNotice'

const meta: Meta<typeof InstallCodyAppNotice> = {
    title: 'cody/notices/EmbeddingsEnabledNotice',
    component: InstallCodyAppNotice,
    decorators: [VSCodeStoryDecorator],
}

export default meta

// TODO: Reload button needs a more muted style

export const InstallCodyAppNoticeStory: StoryObj<typeof InstallCodyAppNotice> = {
    render: () => (
        <div style={{ background: 'rgb(28, 33, 40)' }}>
            <InstallCodyAppNotice
                title="Install Cody App for Embeddings"
                text="You can increase the quality of Cody's chat and autocomplete by installing the Cody desktop app."
                linkText="Learn more"
                linkHref="https://docs.sourcegraph.com/cody/overview/app"
                actionButtons={[<VSCodeButton>Install Cody App</VSCodeButton>, <VSCodeButton>Reload</VSCodeButton>]}
                onDismiss={() => {}}
            />
        </div>
    ),
}
