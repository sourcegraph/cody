import { ps } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { ChatMessageContent } from './ChatMessageContent'

const meta: Meta<typeof ChatMessageContent> = {
    title: 'Chat/ContainerTest',
    component: ChatMessageContent,
    parameters: {
        layout: 'padded',
    },
    decorators: [story => <div className="tw-m-5">{story()}</div>, VSCodeStandaloneComponent],
}

export default meta
type Story = StoryObj<typeof ChatMessageContent>

const markdownWithFilePath = `Here's a file example:

\`\`\`typescript:/path/to/example.ts
function example() {
    console.log('Testing containers')
    return true
}
\`\`\`
`

export const WithFilePath: Story = {
    args: {
        displayMarkdown: markdownWithFilePath,
        isMessageLoading: false,
        humanMessage: {
            text: ps`Show me a file example`,
            hasInitialContext: { repositories: false, files: false },
            rerunWithDifferentContext: () => {},
            hasExplicitMentions: false,
            appendAtMention: () => {},
        },
        copyButtonOnSubmit: () => console.log('Copy clicked'),
        insertButtonOnSubmit: () => console.log('Insert clicked'),
        smartApplyEnabled: true,
        smartApply: {
            onSubmit: ({ id, text }) => console.log('Smart apply:', id, text),
            onAccept: id => console.log('Accept:', id),
            onReject: id => console.log('Reject:', id)
        },
        guardrails: {
            searchAttribution: async (snippet: string) => ({
                limitHit: false,
                repositories: [{ name: 'example/repo' }]
            })
        }
    },
}
