import webviewTailwindConfig from '../vscode/webviews/tailwind.config.mjs'

export default {
    ...webviewTailwindConfig,
    content: {
        relative: true,
        files: ['src/*.{ts,tsx}', '../vscode/webviews/**/*.{ts,tsx}'],
    },
}
