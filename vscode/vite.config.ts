import { defineProjectWithDefaults } from '../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    test: {
        include: ['src/**/*.test.ts?(x)'],
        setupFiles: ['src/testutils/vscode.ts'],
    },
})
