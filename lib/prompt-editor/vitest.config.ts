import { defineProjectWithDefaults } from '../../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    test: {
        environmentMatchGlobs: [['src/**/*.test.tsx', 'happy-dom']],
        setupFiles: ['src/testSetup.ts'],
    },
})
