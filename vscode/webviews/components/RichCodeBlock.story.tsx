import type { Guardrails } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeWebview } from '../storybook/VSCodeStoryDecorator'
import { MockNoGuardrails } from '../utils/guardrails'
import { RichCodeBlock } from './RichCodeBlock'

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

// Create an example with enough code lines to trigger guardrails check
const sampleCode = `// This is a sample JavaScript code
function calculateFactorial(n) {
    if (n === 0 || n === 1) {
        return 1;
    }

    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }

    return result;
}

// Example usage
console.log(calculateFactorial(5)); // 120
console.log(calculateFactorial(10)); // 3628800

// Additional helper function
function isEven(num) {
    return num % 2 === 0;
}`

const highlightedCode = (
    <>
        <span className="hljs-comment">{'// This is a sample JavaScript code'}</span>
        <span className="hljs-keyword">function</span>{' '}
        <span className="hljs-title function_">calculateFactorial</span>
        {'('}
        <span className="hljs-params">n</span>
        {') {'}
        <span className="hljs-keyword">if</span>
        {' (n === '}
        <span className="hljs-number">0</span> || n === <span className="hljs-number">1</span>
        {') {'}
        <span className="hljs-keyword">return</span> <span className="hljs-number">1</span>;{'}'}
        <span className="hljs-keyword">let</span> result = <span className="hljs-number">1</span>;
        <span className="hljs-keyword">for</span>
        {' ('}
        <span className="hljs-keyword">let</span> i = <span className="hljs-number">2</span>
        {'; i <= n; i++) {'}
        result *= i;
        {'}'}
        <span className="hljs-keyword">return</span> result;
        {'}'}
        <span className="hljs-comment">{'// Example usage'}</span>
        <span className="hljs-variable language_">console</span>.
        <span className="hljs-title function_">log</span>
        {'('}
        <span className="hljs-title function_">calculateFactorial</span>(
        <span className="hljs-number">5</span>
        {'));'} <span className="hljs-comment">{'// 120'}</span>
        <span className="hljs-variable language_">console</span>.
        <span className="hljs-title function_">log</span>
        {'('}
        <span className="hljs-title function_">calculateFactorial</span>(
        <span className="hljs-number">10</span>
        {'));'} <span className="hljs-comment">{'// 3628800'}</span>
        <span className="hljs-comment">{'// Additional helper function'}</span>
        <span className="hljs-keyword">function</span>{' '}
        <span className="hljs-title function_">isEven</span>
        {'('}
        <span className="hljs-params">num</span>
        {') {'}
        <span className="hljs-keyword">return</span> num % <span className="hljs-number">2</span> ==={' '}
        <span className="hljs-number">0</span>;{'}'}
    </>
)

const meta: Meta<typeof RichCodeBlock> = {
    title: 'components/RichCodeBlock',
    component: RichCodeBlock,

    args: {
        plainCode: sampleCode,
        markdownCode: `\`\`\`js\n${sampleCode}\n\`\`\``,
        children: highlightedCode,
        language: 'javascript',
        isCodeComplete: true,
        onCopy: () => console.log('Code copied'),
        onInsert: (code, newFile) => console.log('Insert code', { code, newFile }),
        guardrails: new MockNoGuardrails(),
    },

    decorators: [VSCodeWebview],
}

export default meta

export const Default: StoryObj<typeof meta> = {}

export const WithFileName: StoryObj<typeof meta> = {
    args: {
        fileName: 'example.js',
    },
}

export const ShellCommand: StoryObj<typeof meta> = {
    args: {
        children: (
            <>
                <span className="hljs-built_in">echo</span>{' '}
                <span className="hljs-string">"Hello, World!"</span>
            </>
        ),
        plainCode: 'echo "Hello, World!"',
        markdownCode: '```bash\necho "Hello, World!"\n```',
        language: 'bash',
        isShellCommand: true,
        onExecute: cmd => console.log('Execute command:', cmd),
    },
}

export const Loading: StoryObj<typeof meta> = {
    args: {
        isCodeComplete: false,
    },
}

// Guardrails examples
export const GuardrailsOff: StoryObj<typeof meta> = {
    args: {
        guardrails: new MockNoGuardrails(),
    },
    name: 'Guardrails - Off Mode',
}

export const GuardrailsPermissivePass: StoryObj<typeof meta> = {
    args: {
        guardrails: new MockGuardrails(false, false), // No matches
    },
    name: 'Guardrails - Permissive Mode (Pass)',
}

export const GuardrailsPermissiveFail: StoryObj<typeof meta> = {
    args: {
        guardrails: new MockGuardrails(false, true), // Has matches
    },
    name: 'Guardrails - Permissive Mode (Fail)',
}

export const GuardrailsEnforcedPass: StoryObj<typeof meta> = {
    args: {
        guardrails: new MockGuardrails(true, false), // No matches
    },
    name: 'Guardrails - Enforced Mode (Pass)',
}

export const GuardrailsEnforcedFail: StoryObj<typeof meta> = {
    args: {
        guardrails: new MockGuardrails(true, true), // Has matches
    },
    name: 'Guardrails - Enforced Mode (Fail)',
}

export const GuardrailsEnforcedError: StoryObj<typeof meta> = {
    args: {
        guardrails: new MockGuardrails(true, false, true), // Error case
    },
    name: 'Guardrails - Enforced Mode (API Error)',
}

export const GuardrailsSlowCheck: StoryObj<typeof meta> = {
    args: {
        guardrails: new MockGuardrails(true, false, false, 10000), // Long delay
    },
}
