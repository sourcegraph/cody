import { sveltekit } from '@sveltejs/kit/vite'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineProjectWithDefaults } from '../.config/viteShared'

export default defineProjectWithDefaults(__dirname, {
    plugins: [sveltekit(), svelteTesting()],
})
