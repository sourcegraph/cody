import type { Meta, StoryObj } from '@storybook/react'

import { GuardrailsCheckStatus } from '@sourcegraph/cody-shared'
import React from 'react'
import { CodeBlockPlaceholder } from './CodeBlockPlaceholder'

const meta: Meta<typeof CodeBlockPlaceholder> = {
    title: 'Components/CodeBlockPlaceholder',
    component: CodeBlockPlaceholder,
    parameters: {
        layout: 'centered',
    },
}

export default meta

type Story = StoryObj<typeof CodeBlockPlaceholder>

export const Default: Story = {
    args: {
        text: 'console.log("Hello, world!");',
    },
}

const longCode = `function add(a, b) {
    return a + b;
}

// Short
// comment
function subtract(a, b) {
    return a - b;
}

function multiply(a, b) {
    return a * b;
}
`

export const LongCode: Story = {
    args: {
        text: longCode,
    },
}

export const Animated: Story = {
    render: () => {
        const [text, setText] = React.useState('')
        const codeToType =
            'function animate() {\n    console.log("This is an animated story");\n    return true;\n}'
        const [index, setIndex] = React.useState(0)

        React.useEffect(() => {
            const timer = setInterval(() => {
                if (index >= codeToType.length) {
                    setTimeout(() => {
                        setText('')
                        setIndex(0)
                    }, 3000) // Pause for 2 seconds before restarting
                    return
                }
                setText(prev => prev + codeToType[index])
                setIndex(prev => prev + 1)
            }, 100) // Type each character with 100ms delay

            return () => clearInterval(timer)
        }, [index])

        return <CodeBlockPlaceholder text={text} status={GuardrailsCheckStatus.Checking} />
    },
}
