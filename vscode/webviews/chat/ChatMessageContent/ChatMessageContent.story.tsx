import { ps } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeWebview } from '../../storybook/VSCodeStoryDecorator'
import { ChatMessageContent } from './ChatMessageContent'

const meta: Meta<typeof ChatMessageContent> = {
    title: 'chat/ChatMessageContent',
    component: ChatMessageContent,

    args: {
        displayMarkdown: '# Hello\nThis is a test message',
        isMessageLoading: false,
        humanMessage: null,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: undefined,
        smartApplyEnabled: false,
        smartApply: undefined,
        guardrails: undefined,
    },

    decorators: [VSCodeWebview],
}

export default meta

export const Default: StoryObj<typeof meta> = {}

export const WithCodeBlock: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: 'Code Example\n```javascript\nconsole.log("Hello world");\n```',
    },
}

export const WithCodeBlockNoSmartApply: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: '## Code Example\n```javascript\nconsole.log("Hello world");\n```',
        smartApplyEnabled: false,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
    },
    name: 'With Code Block - No Smart Apply (Web Client)',
}

export const WithCodeBlockWithSmartApply: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: '### Code Example\n```javascript\nconsole.log("Hello world");\n```',
        smartApplyEnabled: true,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        smartApply: {
            onSubmit: () => console.log('Smart apply submitted'),
            onAccept: () => console.log('Smart apply accepted'),
            onReject: () => console.log('Smart apply rejected'),
        },
    },
    name: 'With Code Block - With Smart Apply (VS Code)',
}

export const WithMultipleCodeBlocks: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: `# Multiple Code Blocks
Here's the first code block:
\`\`\`javascript
function hello() {
    console.log("Hello world");
}
\`\`\`

And here's the second one:
\`\`\`python
def hello():
    print("Hello world")
\`\`\``,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
    },
}

export const SmartApplyPending: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: '# Working Example\n```javascript\nconsole.log("Hello world");\n```',
        smartApplyEnabled: true,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        smartApply: {
            onSubmit: () => console.log('Smart apply submitted'),
            onAccept: () => console.log('Smart apply accepted'),
            onReject: () => console.log('Smart apply rejected'),
        },
        humanMessage: {
            text: ps`Write a hello world example`,
            intent: 'chat',
            hasInitialContext: {
                repositories: false,
                files: false,
            },
            hasExplicitMentions: false,
            rerunWithDifferentContext: () => console.log('Rerun with different context'),
            appendAtMention: () => console.log('Append at mention'),
        },
    },
    name: 'Smart Apply - Pending State',
}

export const SmartApplyWorking: StoryObj<typeof meta> = {
    render: args => {
        // Return the component with state and callbacks set up
        return <ChatMessageContent {...args} />
    },
    args: {
        displayMarkdown: '# Working Example\n```javascript\nconsole.log("Hello world");\n```',
        smartApplyEnabled: true,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        smartApply: {
            onSubmit: () => console.log('Smart apply submitted'),
            onAccept: () => console.log('Smart apply accepted'),
            onReject: () => console.log('Smart apply rejected'),
        },
        humanMessage: {
            text: ps`Write a hello world example`,
            intent: 'chat',
            hasInitialContext: {
                repositories: false,
                files: false,
            },
            hasExplicitMentions: false,
            rerunWithDifferentContext: () => console.log('Rerun with different context'),
            appendAtMention: () => console.log('Append at mention'),
        },
    },
    name: 'Smart Apply - Working State',
}

export const EditIntent: StoryObj<typeof meta> = {
    args: {
        displayMarkdown:
            '# Edit Intent Example\n```javascript:hello.js\n+ console.log("Hello world");\n+ \n- // console.log("Hello world");\n```',
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        smartApplyEnabled: true,
        smartApply: undefined,
        humanMessage: {
            text: ps`Write a hello world example`,
            intent: 'edit',
            hasInitialContext: {
                repositories: false,
                files: false,
            },
            hasExplicitMentions: false,
            rerunWithDifferentContext: () => console.log('Rerun with different context'),
            appendAtMention: () => console.log('Append at mention'),
        },
    },
    name: 'Edit Intent with Preview',
}

export const Loading: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: '# Loading...',
        isMessageLoading: true,
    },
}

export const WithThinkContent: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: '<think>\nAnalyzing the problem...\n</think>\nHere is the solution.',
    },
}
