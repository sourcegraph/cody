import { defineProjectWithDefaults } from '../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    test: {
        include: ['{src,webviews}/**/*.test.ts?(x)'],
        setupFiles: ['src/testutils/vscode.ts', 'src/testutils/testSetup.ts'],
    },
})
