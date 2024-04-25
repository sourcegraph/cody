import { statSync } from 'fs'
import { resolve } from 'path'

import { defineProjectWithDefaults } from '../.config/viteShared'


export default defineProjectWithDefaults(__dirname, {
    resolve: {
    },
})
