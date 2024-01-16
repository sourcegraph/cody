import path from 'path'

import { mergeConfig, UserConfig } from 'vite'
import { defineProject, type UserWorkspaceConfig } from 'vitest/config'

/**
 * Default configuration for a project in a workspace.
 */
const defaultProjectConfig: UserWorkspaceConfig = {
    resolve: {
        alias: [
            // Build from TypeScript sources so we don't need to run `tsc -b` in the background
            // during dev.
            {
                find: /^(@sourcegraph\/cody-[\w-]+)$/,
                replacement: '$1/src/index.ts',
            },
        ],
    },
    css: { modules: { localsConvention: 'camelCaseOnly' } },
}

/**
 * Configuration that applies to the entire workspace.
 */
const defaultUserConfig: UserConfig = { logLevel: 'warn' }

export function defineProjectWithDefaults(dir: string, config: UserWorkspaceConfig): UserWorkspaceConfig {
    const name = path.basename(dir)
    if (!config.test) {
        config.test = {}
    }
    if (!config.test.name) {
        config.test.name = name
    }

    return mergeConfig(
        mergeConfig(defaultProjectConfig, defaultUserConfig),
        defineProject(config) as UserWorkspaceConfig
    )
}
