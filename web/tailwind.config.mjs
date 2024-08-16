import webviewTailwindConfig from '../vscode/webviews/tailwind.config.mjs'

export default {
    ...webviewTailwindConfig,
    content: {
        relative: true,
        files: [
            'demo/*.{ts,tsx}',
            '../vscode/webviews/**/*.{ts,tsx}',
            'lib/**/*.{ts,tsx}',
            '../lib/prompt-editor/**/*.{ts,tsx}',
        ],
    },
}
