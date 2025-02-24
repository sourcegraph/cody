import { defineProjectWithDefaults } from '../../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    test: {
        environment: 'jsdom', // needed for DOMPurify
        setupFiles: ['src/test/testSetup.ts'],
    },
})
