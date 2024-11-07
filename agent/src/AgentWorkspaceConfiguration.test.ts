import { beforeEach, describe, expect, it } from 'vitest'
import { AgentWorkspaceConfiguration } from './AgentWorkspaceConfiguration'
import type { ClientInfo, ExtensionConfiguration } from './protocol-alias'

describe('AgentWorkspaceConfiguration', () => {
    let config: AgentWorkspaceConfiguration

    const clientInfo: ClientInfo = {
        name: 'vscode',
        version: '1.0.0',
        ideVersion: '1.80.0',
        capabilities: {
            globalState: 'server-managed',
            webview: 'native',
        },
        workspaceRootUri: '/',
    }

    const customConfigJson = `
        {
          "http.systemCertificates": true,
          "http.experimental.systemCertificatesV2": true,
          "cody.debug": {
            "verbose": true
          },
          "cody.advanced.hasNativeWebview": false,
          "cody.autocomplete.advanced.provider": "anthropic",
          "cody.experimental": {
            "tracing": true
          },
          "cody.telemetry": {
            "level": "agent"
          },
          "editor": {
            "insertSpaces": true
          },
          "foo.bar": {
            "baz.qux": true,
            "baz": {
                "d1.d2": {
                    "v": 1
                }
            },
            "dotted.property.name": 42
          }
        }
    `

    const extensionConfig: ExtensionConfiguration = {
        serverEndpoint: 'https://sourcegraph.test',
        customHeaders: { 'X-Test': 'test' },
        telemetryClientName: 'test-client',
        autocompleteAdvancedProvider: 'anthropic',
        autocompleteAdvancedModel: 'claude-2',
        verboseDebug: true,
        codebase: 'test-repo',
        customConfigurationJson: customConfigJson,
        customConfiguration: {
            'cody.debug.additional': true
        },
    }

    beforeEach(() => {
        config = new AgentWorkspaceConfiguration(
            [],
            () => clientInfo,
            () => extensionConfig
        )
    })

    describe('get', () => {
        it('can return sub-configuration object', () => {
            expect(config.get('cody.serverEndpoint')).toEqual('https://sourcegraph.test')
            expect(config.get('cody.customHeaders')).toEqual({ 'X-Test': 'test' })
            expect(config.get('cody.telemetry.level')).toBe('agent')
            // clientName undefined because custom JSON specified telemetry with level alone.
            expect(config.get('cody.telemetry.clientName')).toBe('test-client')
            expect(config.get('cody.autocomplete.enabled')).toBe(true)
            expect(config.get('cody.autocomplete.advanced.provider')).toBe('anthropic')
            expect(config.get('cody.autocomplete.advanced.model')).toBe('claude-2')
            expect(config.get('cody.advanced.agent.running')).toBe(true)
            expect(config.get('cody.debug.verbose')).toBe(true)
            expect(config.get('cody.experimental.tracing')).toBe(true)
            expect(config.get('cody.codebase')).toBe('test-repo')
            expect(config.get('editor.insertSpaces')).toBe(true)
        })

        it('returns correct values for configuration sections', () => {
            expect(config.get('http')).toStrictEqual({
                experimental: {
                    systemCertificatesV2: true,
                },
                systemCertificates: true,
            })

            expect(config.get('http.experimental')).toStrictEqual({
                systemCertificatesV2: true,
            })

            expect(config.get('cody')).toStrictEqual({
                advanced: {
                    agent: {
                        capabilities: {
                            storage: true,
                        },
                        extension: {
                            version: '1.0.0',
                        },
                        ide: {
                            name: 'VSCode',
                            version: '1.80.0',
                        },
                        running: true,
                    },
                    hasNativeWebview: false,
                },
                autocomplete: {
                    advanced: {
                        model: 'claude-2',
                        provider: 'anthropic',
                    },
                    enabled: true,
                },
                codebase: 'test-repo',
                customHeaders: {
                    'X-Test': 'test',
                },
                debug: {
                    verbose: true,
                    additional: true
                },
                experimental: {
                    tracing: true,
                },
                serverEndpoint: 'https://sourcegraph.test',
                telemetry: {
                    clientName: 'test-client',
                    level: 'agent',
                },
            })
        })

        it('handles parsing nested keys as objects', () => {
            expect(config.get('foo.bar.baz')).toStrictEqual({ 'd1.d2': { v: 1 } })
        })

        // This reflects VSCode's behavior around configuration. OpenContext
        // providers rely on this behavior, specifically, that property names
        // at the top level are split on dots (so 'openctx.provider' is part of
        // 'openctx') but within subobjects are not split (so
        // 'https://github.com/foo/bar': true is not split into 'https://github'
        // and 'com/foo/bar')
        it('does not split apart dotted property names in nested objects', () => {
            // The shape of the foo object, note the outermost dotted name
            // foo.bar can be split into foo and bar.
            expect(config.get('foo')).toStrictEqual({
                bar: {
                    'baz.qux': true,
                    baz: {
                        'd1.d2': {
                            v: 1,
                        },
                    },
                    'dotted.property.name': 42,
                },
            })
            // 'baz.qux' is an atom different to baz containing qux. It is not
            // outermost thus it is not split.
            expect(config.get('foo.bar.baz.qux')).toStrictEqual(undefined)
            // 'd1.d2' is an atom that should not be split at d1.
            expect(config.get('foo.bar.baz.d1')).toBeUndefined()
        })

        it('handles agent capabilities correctly', () => {
            expect(config.get('cody.advanced.agent.capabilities.storage')).toBe(true)
            expect(config.get('cody.advanced.hasNativeWebview')).toBe(false)
        })

        it('returns default value for unknown sections', () => {
            expect(config.get('unknown.section', 'default')).toBe('default')
        })

        it('returns new instance each time when getting the same value', () => {
            const testObject = { key: 'value' }
            config.update('test.object', testObject)

            const firstGet = config.get('test.object')
            firstGet.key = 'modified'

            const secondGet = config.get('test.object')
            expect(secondGet.key).toBe('value')
        })
    })

    describe('has', () => {
        it('returns true for existing sections', () => {
            expect(config.has('cody.serverEndpoint')).toBe(true)
        })

        it('returns false for non-existing sections', () => {
            expect(config.has('nonexistent.section')).toBe(false)
        })

        it('returns false for non-existing sub-sections', () => {
            expect(config.has('http.foo')).toBe(false)
        })

        it('returns true for existing sub-sections', () => {
            expect(config.has('http.experimental')).toBe(true)
        })
    })

    describe('inspect', () => {
        it('returns undefined for any section', () => {
            expect(config.inspect('cody.serverEndpoint')).toBeUndefined()
        })
    })

    describe('update', () => {
        it('updates simple configuration value', async () => {
            await config.update('cody.serverEndpoint', 'https://new-endpoint.test')
            expect(config.get('cody.serverEndpoint')).toBe('https://new-endpoint.test')
        })

        it('updates nested configuration object', async () => {
            await config.update('cody.debug', { verbose: false, newSetting: true })
            expect(config.get('cody.debug')).toEqual({ verbose: false, newSetting: true, additional: true, })
            expect(config.get('cody.debug.newSetting')).toEqual(true)
        })

        it('creates new configuration path if it does not exist', async () => {
            await config.update('newSection.newSubSection', 'value')
            expect(config.get('newSection.newSubSection')).toBe('value')
        })

        it('updates array values', async () => {
            await config.update('testArray', [1, 2, 3])
            expect(config.get('testArray')).toEqual([1, 2, 3])
        })

        it('handles null value', async () => {
            await config.update('cody.serverEndpoint', null)
            expect(config.get('cody.serverEndpoint')).toBeNull()
        })

        it('updates boolean values', async () => {
            await config.update('feature.enabled', false)
            expect(config.get('feature.enabled')).toBe(false)
        })
    })
})
