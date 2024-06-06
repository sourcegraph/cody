import { defineProjectWithDefaults } from '../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    test: {
        include: ['{src,webviews}/**/*.test.ts?(x)'],
        setupFiles: ['src/testutils/vscode.ts', 'src/testutils/testSetup.ts', 'webviews/testSetup.ts'],

        // Only use happy-dom for React component unit tests. Unit tests of plain JavaScript
        // functions don't need the DOM.
        environmentMatchGlobs: [['webviews/**/*.test.tsx', 'happy-dom']],
        benchmark: {
            include: ['{src,webviews}/**/*.bench.ts'],
        },
    },
})
