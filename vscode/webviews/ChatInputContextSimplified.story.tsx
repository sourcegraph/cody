import { Meta, StoryObj } from '@storybook/react'

import { ChatContextStatus } from '@sourcegraph/cody-shared'

import { ChatInputContextSimplified } from './ChatInputContextSimplified'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'

import styles from './storybook/VSCodeStoryDecorator.module.css'

const meta: Meta<typeof ChatInputContextSimplified> = {
    title: 'cody/Old Context Status',
    component: ChatInputContextSimplified,
    decorators: [VSCodeStoryDecorator],
}

export default meta

const onboardingCallbacks = {
    reloadStatus: () => alert('reload'),
}

export const ChatInputContextNoRepoOpen: StoryObj<typeof ChatInputContextSimplified> = {
    render: () => {
        const contextStatus: ChatContextStatus = {
            connection: false,
        }
        return (
            <div className={styles.testDarkSidebarBottom}>
                <ChatInputContextSimplified contextStatus={contextStatus} onboardingPopupProps={onboardingCallbacks} />
            </div>
        )
    },
}

export const ChatInputContextHasDotcomEmbeddings: StoryObj<typeof ChatInputContextSimplified> = {
    render: () => {
        const contextStatus: ChatContextStatus = {
            codebase: 'github.com/sourcegraph/example',
            filePath: 'foo/bar.js',
            mode: 'embeddings',
            connection: true,
            embeddingsEndpoint: 'https://sourcegraph.com/',
        }
        return (
            <div className={styles.testDarkSidebarBottom}>
                <ChatInputContextSimplified contextStatus={contextStatus} onboardingPopupProps={onboardingCallbacks} />
            </div>
        )
    },
}

export const ChatInputContextHasEnterpriseEmbeddings: StoryObj<typeof ChatInputContextSimplified> = {
    render: () => {
        const contextStatus: ChatContextStatus = {
            codebase: 'github.com/sourcegraph/example',
            filePath: 'foo/bar.js',
            mode: 'embeddings',
            connection: true,
            embeddingsEndpoint: 'https://sourcegraph.sourcegraph.com/',
        }
        return (
            <div className={styles.testDarkSidebarBottom}>
                <ChatInputContextSimplified contextStatus={contextStatus} onboardingPopupProps={onboardingCallbacks} />
            </div>
        )
    },
}
