import path from 'node:path'
import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { allClientCapabilitiesEnabled } from './allClientCapabilitiesEnabled'
import type {
    AutocompleteEditItem,
    AutocompleteResult,
    ExtensionConfiguration,
    Position,
} from './protocol-alias'

expect.extend({ toMatchImageSnapshot })

describe('Autoedit', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'autoedit'))
    const clientConfiguration: Partial<ExtensionConfiguration> = {
        suggestionsMode: 'auto-edit (Experimental)',
    }

    beforeAll(async () => {
        await workspace.beforeAll()
    })

    afterAll(async () => {
        await workspace.afterAll()
    })

    describe('autoedit - completions', () => {
        const client = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: 'autoedit',
            credentials: TESTING_CREDENTIALS.dotcom,
            capabilities: {
                ...allClientCapabilitiesEnabled,
                autoEdit: 'enabled',
                autoEditInlineDiff: 'insertions-and-deletions',
                autoEditAsideDiff: 'none',
            },
        })

        beforeAll(async () => {
            await client.beforeAll(clientConfiguration)
        })

        afterAll(async () => {
            await client.afterAll()
        })

        it('autocomplete/execute (non-empty result)', async () => {
            const uri = workspace.file('src', 'sum.ts')
            await client.openFile(uri)

            // Set a small visibility delay for testing purposes.
            const visibilityDelay = 100
            await client.request('testing/autocomplete/setCompletionVisibilityDelay', {
                delay: visibilityDelay,
            })

            // Generate completions for the current cursor position.
            const result = await client.request('autocomplete/execute', {
                uri: uri.toString(),
                position: { line: 1, character: 4 },
                triggerKind: 'Automatic',
            })

            console.log(result)

            // The LLM provided with a completion result.
            expect(result.items.length).toBeGreaterThan(0)
            expect(result.items[0].type).toBe('completion')

            const texts = result.items
                .filter(item => item.type === 'completion')
                .map(item => item.insertText)
            expect(texts).toMatchInlineSnapshot(
                `
              [
                "    return a + b;",
              ]
            `
            )
        }, 10_000)

        it('autocomplete/execute multiline (non-empty result)', async () => {
            // Open merge sort with a full algorithm implementation to add it to the context.
            // Otherwise there's a higher chance that model won't complete the code because of all
            // the functions in the workspace missing implementations.
            const uri1 = workspace.file('src', 'mergeSort.ts')
            await client.openFile(uri1)

            const uri = workspace.file('src', 'bubbleSort.ts')
            await client.openFile(uri)

            const result = await client.request('autocomplete/execute', {
                uri: uri.toString(),
                position: { line: 1, character: 4 },
                triggerKind: 'Automatic',
            })

            // The LLM provided with a completion result.
            expect(result.items.length).toBeGreaterThan(0)
            expect(result.items[0].type).toBe('completion')

            const texts = result.items
                .filter(item => item.type === 'completion')
                .map(item => item.insertText)
            expect(texts).toMatchSnapshot()
        }, 10_000)
    })

    describe('autoedit - edits', () => {
        async function getAutoEditSuggestion(
            client: TestClient,
            uri: vscode.Uri,
            position: Position
        ): Promise<AutocompleteEditItem> {
            await client.openFile(uri)

            // Set a small visibility delay for testing purposes.
            const visibilityDelay = 100
            await client.request('testing/autocomplete/setCompletionVisibilityDelay', {
                delay: visibilityDelay,
            })

            // Generate an edit for the current cursor position.
            const result = (await client.request('autocomplete/execute', {
                uri: uri.toString(),
                position,
                triggerKind: 'Automatic',
            })) as AutocompleteResult

            // Expect the result to have at least one item
            expect(result.items.length).toBeGreaterThan(0)

            // Expect the first item to be an edit
            const editItem = result.items[0] as AutocompleteEditItem
            expect(editItem.type).toBe('edit')

            return editItem
        }

        describe('client can only render inline diffs', () => {
            const client = TestClient.create({
                workspaceRootUri: workspace.rootUri,
                name: 'autoedit',
                credentials: TESTING_CREDENTIALS.dotcom,
                extraConfiguration: {
                    experimentalAutoEditEnabled: true,
                },
                capabilities: {
                    ...allClientCapabilitiesEnabled,
                    autoEdit: 'enabled',
                    autoEditInlineDiff: 'insertions-and-deletions',
                    autoEditAsideDiff: 'none',
                },
            })

            beforeAll(async () => {
                await client.beforeAll(clientConfiguration)
            })

            afterAll(async () => {
                await client.afterAll()
            })

            it('produces an inline diff for a simple suggestion', async () => {
                const file = workspace.file('src', 'sum-ages.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 5, character: 0 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "
                  export function sumAge(personA: Person, personB: Person): number {
                      return personA.age + personB.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No aside options provided (client only supports inline)
                expect(aside.diff).toBeNull()
                expect(aside.image).toBeNull()

                // Inline diff provided
                expect(inline.changes).not.toBeNull()
            }, 10_000)

            it('produces an inline diff for a complex suggestion', async () => {
                const file = workspace.file('src', 'sum-ages-complex-diff.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 6, character: 52 })
                // No completions provided
                // No need to check items array for an edit result

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "export function sumAge(a: Person, b: Person): number {
                      return a.age + b.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No aside options provided (client only supports inline)
                expect(aside.diff).toBeNull()
                expect(aside.image).toBeNull()

                // Inline diff provided
                expect(inline.changes).not.toBeNull()
            }, 10_000)
        })

        describe('client can only render aside diffs as images', () => {
            const client = TestClient.create({
                workspaceRootUri: workspace.rootUri,
                name: 'autoedit',
                credentials: TESTING_CREDENTIALS.dotcom,
                extraConfiguration: {
                    experimentalAutoEditEnabled: true,
                },
                capabilities: {
                    ...allClientCapabilitiesEnabled,
                    autoEdit: 'enabled',
                    autoEditInlineDiff: 'none',
                    autoEditAsideDiff: 'image',
                },
            })

            beforeAll(async () => {
                await client.beforeAll(clientConfiguration)
            })

            afterAll(async () => {
                await client.afterAll()
            })

            it('produces a unified image diff for a simple suggestion', async () => {
                const file = workspace.file('src', 'sum-ages.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 5, character: 0 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "
                  export function sumAge(personA: Person, personB: Person): number {
                      return personA.age + personB.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No inline diff provided (client only supports aside)
                expect(inline.changes).toBeNull()

                // No aside diff object provided (client will use the image to show the diff)
                expect(aside.diff).toBeNull()

                // Image is provided
                expect(aside.image).not.toBeNull()
                const { dark, light } = aside.image!
                const darkBuffer = Buffer.from(dark.split(',')[1], 'base64')
                const lightBuffer = Buffer.from(light.split(',')[1], 'base64')
                expect(lightBuffer).toMatchImageSnapshot({
                    customSnapshotIdentifier: 'simple-unified-diff-light',
                })
                expect(darkBuffer).toMatchImageSnapshot({
                    customSnapshotIdentifier: 'simple-unified-diff-dark',
                })
            }, 10_000)

            it('produces a unified image diff for a complex suggestion', async () => {
                const file = workspace.file('src', 'sum-ages-complex-diff.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 6, character: 52 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "export function sumAge(a: Person, b: Person): number {
                      return a.age + b.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No inline diff provided (client only supports aside)
                expect(inline.changes).toBeNull()

                // No aside diff object provided (client will use the image to show the diff)
                expect(aside.diff).toBeNull()

                // Image is provided
                expect(aside.image).not.toBeNull()
                const { dark, light } = aside.image!
                const darkBuffer = Buffer.from(dark.split(',')[1], 'base64')
                const lightBuffer = Buffer.from(light.split(',')[1], 'base64')
                expect(lightBuffer).toMatchImageSnapshot({
                    customSnapshotIdentifier: 'complex-unified-diff-light',
                })
                expect(darkBuffer).toMatchImageSnapshot({
                    customSnapshotIdentifier: 'complex-unified-diff-dark',
                })
            }, 10_000)
        })

        describe('client can only render aside diffs with their own implementation', () => {
            const client = TestClient.create({
                workspaceRootUri: workspace.rootUri,
                name: 'autoedit',
                credentials: TESTING_CREDENTIALS.dotcom,
                extraConfiguration: {
                    experimentalAutoEditEnabled: true,
                },
                capabilities: {
                    ...allClientCapabilitiesEnabled,
                    autoEdit: 'enabled',
                    autoEditInlineDiff: 'none',
                    autoEditAsideDiff: 'diff',
                },
            })

            beforeAll(async () => {
                await client.beforeAll(clientConfiguration)
            })

            afterAll(async () => {
                await client.afterAll()
            })

            it('produces a diff for a simple suggestion', async () => {
                const file = workspace.file('src', 'sum-ages.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 5, character: 0 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "
                  export function sumAge(personA: Person, personB: Person): number {
                      return personA.age + personB.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No inline diff provided (client only supports aside)
                expect(inline.changes).toBeNull()

                // No image provided (client will render the aside diff in their own way)
                expect(aside.image).toBeNull()

                // Diff object is provided
                expect(aside.diff).not.toBeNull()
                const { modifiedLines, unchangedLines } = aside.diff!
                // Check the diff has contents, we don't snapshot this as it is quite a large object
                expect(modifiedLines.length).toBeGreaterThan(0)
                expect(unchangedLines.length).toBeGreaterThan(0)
            }, 10_000)

            it('produces a unified image diff for a complex suggestion', async () => {
                const file = workspace.file('src', 'sum-ages-complex-diff.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 6, character: 52 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "export function sumAge(a: Person, b: Person): number {
                      return a.age + b.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No inline diff provided (client only supports aside)
                expect(inline.changes).toBeNull()

                // No image provided (client will render the aside diff in their own way)
                expect(aside.image).toBeNull()

                // Diff object is provided
                expect(aside.diff).not.toBeNull()
                const { modifiedLines, unchangedLines } = aside.diff!
                // Check the diff has contents, we don't snapshot this as it is quite a large object
                expect(modifiedLines.length).toBeGreaterThan(0)
                expect(unchangedLines.length).toBeGreaterThan(0)
            }, 10_000)
        })

        describe('client can only render aside diffs with their own implementation', () => {
            const client = TestClient.create({
                workspaceRootUri: workspace.rootUri,
                name: 'autoedit',
                credentials: TESTING_CREDENTIALS.dotcom,
                extraConfiguration: {
                    experimentalAutoEditEnabled: true,
                },
                capabilities: {
                    ...allClientCapabilitiesEnabled,
                    autoEdit: 'enabled',
                    autoEditInlineDiff: 'none',
                    autoEditAsideDiff: 'diff',
                },
            })

            beforeAll(async () => {
                await client.beforeAll(clientConfiguration)
            })

            afterAll(async () => {
                await client.afterAll()
            })

            it('produces a diff for a simple suggestion', async () => {
                const file = workspace.file('src', 'sum-ages.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 5, character: 0 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "
                  export function sumAge(personA: Person, personB: Person): number {
                      return personA.age + personB.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No inline diff provided (client only supports aside)
                expect(inline.changes).toBeNull()

                // No image provided (client will render the aside diff in their own way)
                expect(aside.image).toBeNull()

                // Diff object is provided
                expect(aside.diff).not.toBeNull()
                const { modifiedLines, unchangedLines } = aside.diff!
                // Check the diff has contents, we don't snapshot this as it is quite a large object
                expect(modifiedLines.length).toBeGreaterThan(0)
                expect(unchangedLines.length).toBeGreaterThan(0)
            }, 10_000)

            it('produces a diff for a complex suggestion', async () => {
                const file = workspace.file('src', 'sum-ages-complex-diff.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 6, character: 52 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "export function sumAge(a: Person, b: Person): number {
                      return a.age + b.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No inline diff provided (client only supports aside)
                expect(inline.changes).toBeNull()

                // No image provided (client will render the aside diff in their own way)
                expect(aside.image).toBeNull()

                // Diff object is provided
                expect(aside.diff).not.toBeNull()
                const { modifiedLines, unchangedLines } = aside.diff!
                // Check the diff has contents, we don't snapshot this as it is quite a large object
                expect(modifiedLines.length).toBeGreaterThan(0)
                expect(unchangedLines.length).toBeGreaterThan(0)
            }, 10_000)
        })

        describe('client can render both inline and aside diffs', () => {
            const client = TestClient.create({
                workspaceRootUri: workspace.rootUri,
                name: 'autoedit',
                credentials: TESTING_CREDENTIALS.dotcom,
                extraConfiguration: {
                    experimentalAutoEditEnabled: true,
                },
                capabilities: {
                    ...allClientCapabilitiesEnabled,
                    autoEdit: 'enabled',
                    autoEditInlineDiff: 'insertions-and-deletions',
                    autoEditAsideDiff: 'image',
                },
            })

            beforeAll(async () => {
                await client.beforeAll(clientConfiguration)
            })

            afterAll(async () => {
                await client.afterAll()
            })

            it('produces an inline diff for a simple suggestion', async () => {
                const file = workspace.file('src', 'sum-ages.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 5, character: 0 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "
                  export function sumAge(humanA: Person, humanB: Person): number {
                      return humanA.age + humanB.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // No aside options provided (client only supports inline)
                expect(aside.diff).toBeNull()
                expect(aside.image).toBeNull()

                // Inline diff provided
                expect(inline.changes).not.toBeNull()
            }, 10_000)

            it('produces a mix of aside and inline diffs for a complex suggestion', async () => {
                const file = workspace.file('src', 'sum-ages-complex-diff.ts')
                const result = await getAutoEditSuggestion(client, file, { line: 6, character: 52 })

                // Prediction accurately reflects the edit that should be made.
                expect(result.prediction).toMatchInlineSnapshot(`
                  "export function sumAge(a: Person, b: Person): number {
                      return a.age + b.age
                  }
                  "
                `)

                const { aside, inline } = result.render

                // Inline diff provided
                expect(inline.changes).not.toBeNull()

                // Aside diff provided as an image
                expect(aside.image).not.toBeNull()
                const { dark, light } = aside.image!
                const darkBuffer = Buffer.from(dark.split(',')[1], 'base64')
                const lightBuffer = Buffer.from(light.split(',')[1], 'base64')
                expect(lightBuffer).toMatchImageSnapshot({
                    customSnapshotIdentifier: 'complex-mixed-diff-light',
                })
                expect(darkBuffer).toMatchImageSnapshot({
                    customSnapshotIdentifier: 'complex-mixed-diff-dark',
                })
            }, 10_000)
        })
    })
})
