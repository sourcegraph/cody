import { ps } from '@sourcegraph/cody-shared'
import type { Guardrails } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeWebview } from '../../storybook/VSCodeStoryDecorator'
import { MockNoGuardrails } from '../../utils/guardrails'
import { ChatMessageContent } from './ChatMessageContent'

class MockGuardrails implements Guardrails {
    constructor(
        public readonly shouldHideCodeBeforeAttribution: boolean,
        private shouldMatch = false,
        private shouldError = false,
        private delay = 1000
    ) {}

    needsAttribution(params: { code: string; language: string | undefined }): boolean {
        return true
    }

    searchAttribution(snippet: string): Promise<any> {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (this.shouldError) {
                    reject(new Error('Mock API error'))
                } else if (this.shouldMatch) {
                    resolve({
                        limitHit: false,
                        repositories: [
                            { name: 'github.com/example/copyrighted-repo' },
                            { name: 'github.com/another/private-repo' },
                        ],
                    })
                } else {
                    resolve({
                        limitHit: false,
                        repositories: [],
                    })
                }
            }, this.delay)
        })
    }
}

// Example code that's long enough to trigger guardrails checks
const longCodeExample = `// Sample implementation of a binary search tree
class TreeNode {
    constructor(val) {
        this.val = val;
        this.left = null;
        this.right = null;
    }
}

class BinarySearchTree {
    constructor() {
        this.root = null;
    }

    insert(val) {
        const newNode = new TreeNode(val);

        if (!this.root) {
            this.root = newNode;
            return this;
        }

        let current = this.root;

        while (true) {
            if (val === current.val) {
                return this; // No duplicates
            }

            if (val < current.val) {
                if (!current.left) {
                    current.left = newNode;
                    return this;
                }
                current = current.left;
            } else {
                if (!current.right) {
                    current.right = newNode;
                    return this;
                }
                current = current.right;
            }
        }
    }

    find(val) {
        if (!this.root) return null;

        let current = this.root;
        let found = false;

        while (current && !found) {
            if (val < current.val) {
                current = current.left;
            } else if (val > current.val) {
                current = current.right;
            } else {
                found = true;
            }
        }

        return found ? current : null;
    }
}`

const meta: Meta<typeof ChatMessageContent> = {
    title: 'chat/ChatMessageContent',
    component: ChatMessageContent,

    args: {
        displayMarkdown: '# Hello\nThis is a test message',
        isMessageLoading: false,
        humanMessage: null,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: undefined,
        smartApply: undefined,
        guardrails: new MockNoGuardrails(),
        regeneratingCodeBlocks: [],
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
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
    },
    name: 'With Code Block - No Smart Apply (Web Client)',
}

const mockSmartApply = {
    onSubmit: () => console.log('Smart apply submitted'),
    onAccept: () => console.log('Smart apply accepted'),
    onReject: () => console.log('Smart apply rejected'),
}

export const WithCodeBlockWithSmartApply: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: '### Code Example\n```javascript\nconsole.log("Hello world");\n```',
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        smartApply: mockSmartApply,
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
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        smartApply: mockSmartApply,
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
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        smartApply: mockSmartApply,
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
        smartApply: mockSmartApply,
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

// Guardrails stories
export const GuardrailsPermissiveMode: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: `# Binary Search Tree Implementation

Here's a complete implementation of a binary search tree in JavaScript:

\`\`\`javascript
${longCodeExample}
\`\`\`

This implementation includes basic methods for inserting nodes and finding values in the tree.`,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        guardrails: new MockGuardrails(false, false), // No matches
    },
    name: 'Guardrails - Permissive Mode (Pass)',
}

export const GuardrailsPermissiveModeFail: StoryObj<typeof meta> = {
    args: {
        displayMarkdown: `# Binary Search Tree Implementation

Here's a complete implementation of a binary search tree in JavaScript:

\`\`\`javascript
${longCodeExample}
\`\`\`

This implementation includes basic methods for inserting nodes and finding values in the tree.`,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        guardrails: new MockGuardrails(false, true), // With matches
    },
    name: 'Guardrails - Permissive Mode (Fail)',
}

export const GuardrailsEnforcedModePass: StoryObj<typeof meta> = {
    render: (args, { guardrailsMode }) => {
        return <ChatMessageContent {...args} />
    },
    args: {
        displayMarkdown: `# Binary Search Tree Implementation

Here's a complete implementation of a binary search tree in JavaScript:

\`\`\`javascript
${longCodeExample}
\`\`\`

This implementation includes basic methods for inserting nodes and finding values in the tree.`,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        guardrails: new MockGuardrails(true, false), // No matches
    },
    name: 'Guardrails - Enforced Mode (Pass)',
}

export const GuardrailsEnforcedModeFail: StoryObj<typeof meta> = {
    render: args => <ChatMessageContent {...args} />,
    args: {
        displayMarkdown: `# Binary Search Tree Implementation

Here's a complete implementation of a binary search tree in JavaScript:

\`\`\`javascript
${longCodeExample}
\`\`\`

This implementation includes basic methods for inserting nodes and finding values in the tree.`,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        guardrails: new MockGuardrails(true, true), // With matches
    },
    name: 'Guardrails - Enforced Mode (Fail)',
}

export const GuardrailsEnforcedModeChecking: StoryObj<typeof meta> = {
    render: (args, { guardrailsMode }) => <ChatMessageContent {...args} />,
    args: {
        displayMarkdown: `# Binary Search Tree Implementation

Here's a complete implementation of a binary search tree in JavaScript:

\`\`\`javascript
${longCodeExample}
\`\`\`

This implementation includes basic methods for inserting nodes and finding values in the tree.`,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        guardrails: new MockGuardrails(true, false, false, 10000), // Long delay
    },
    name: 'Guardrails - Enforced Mode (Checking)',
}

export const GuardrailsEnforcedModeError: StoryObj<typeof meta> = {
    render: args => <ChatMessageContent {...args} />,
    args: {
        displayMarkdown: `# Binary Search Tree Implementation

Here's a complete implementation of a binary search tree in JavaScript:

\`\`\`javascript
${longCodeExample}
\`\`\`

This implementation includes basic methods for inserting nodes and finding values in the tree.`,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        guardrails: new MockGuardrails(true, false, true), // Error case
    },
    name: 'Guardrails - Enforced Mode (API Error)',
}

export const GuardrailsMultipleCodeBlocks: StoryObj<typeof meta> = {
    render: (args, { guardrailsMode }) => <ChatMessageContent {...args} />,
    args: {
        displayMarkdown: `# Multiple Code Blocks with Guardrails

Here's a small code block that won't trigger guardrails:

\`\`\`javascript
function hello() {
    console.log("Hello world");
}
\`\`\`

And here's a larger one that will trigger guardrails checks:

\`\`\`javascript
${longCodeExample}
\`\`\`

Both code blocks should be properly checked based on their size.`,
        copyButtonOnSubmit: () => console.log('Copy button clicked'),
        insertButtonOnSubmit: () => console.log('Insert button clicked'),
        guardrails: new MockGuardrails(true, true), // With matches
    },
    name: 'Guardrails - Multiple Code Blocks',
}
