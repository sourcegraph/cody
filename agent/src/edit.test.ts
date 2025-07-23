import path from 'node:path'
import { FIXTURE_MODELS, modelsService } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { explainPollyError } from './explainPollyError'
import { trimEndOfLine } from './trimEndOfLine'

describe('Edit', { timeout: 5000 }, () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'edit-code'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'edit',
        credentials: TESTING_CREDENTIALS.enterprise,
    })

    beforeAll(async () => {
        vi.spyOn(modelsService, 'models', 'get').mockReturnValue(FIXTURE_MODELS)
        await workspace.beforeAll()
        await client.beforeAll()
        await client.request('command/execute', {
            command: 'cody.search.index-update',
        })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('editCommands/code (basic function)', async () => {
        const uri = workspace.file('src', 'sum.ts')
        await client.openFile(uri, { removeCursor: false })
        client.userInput = {
            instruction: 'Rename `a` parameter to `c`',
        }
        const taskId = await client.request('editTask/start', null)
        if (!taskId) {
            throw new Error('Task cannot be null or undefined')
        }
        await client.acceptLensWasShown(uri)
        const lenses = client.codeLenses.get(uri.toString()) ?? []
        expect(lenses).toHaveLength(4)
        expect(lenses[0].command?.command).toBe('cody.fixup.codelens.accept')
        await client.request('editTask/accept', taskId)
        const newContent = client.workspace.getDocument(uri)?.content
        expect(trimEndOfLine(newContent)).toMatchInlineSnapshot(
            `
                    "export function sum(c: number, b: number): number {
                        /* CURSOR */
                    }
                    "
                    `,
            explainPollyError
        )
    })

    it('editCommand/code (add prop types)', async () => {
        const uri = workspace.file('src', 'ChatColumn.tsx')
        await client.openFile(uri)
        client.userInput = {
            instruction: 'Add types to these props. Introduce new interfaces as necessary',
            model: 'anthropic::2024-10-22::claude-3-5-haiku-latest',
        }
        const taskId = await client.request('editTask/start', null)
        if (!taskId) {
            throw new Error('Task cannot be null or undefined')
        }
        await client.acceptEditTask(uri, taskId)
        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "import { useEffect } from "react";
          import React = require("react");

          export interface Message {
          	text: string
          	chatID: string
          }

          export interface ChatColumnProps {
          	messages: Message[]
          	setChatID: (id: string) => void
          	isLoading: boolean
          }

          export default function ChatColumn({
          	messages,
          	setChatID,
          	isLoading,
          }: ChatColumnProps) {
          }
          	useEffect(() => {
          		if (!isLoading) {
          			setChatID(messages[0].chatID);
          		}
          	}, [messages]);
          	return (
          		<>
          			<h1>Messages</h1>
          			<ul>
          				{messages.map((message) => (
          					<li>{message.text}</li>
          				))}
          			</ul>
          		</>
          	);
          }
          "
        `,
            explainPollyError
        )
    }, 20_000)

    // TODO: fix flakiness and re-enable
    // https://linear.app/sourcegraph/issue/CODY-4300/agent-integration-test-editcommandcode-generate-new-code-is-flaky
    it.skip('editCommand/code (generate new code)', async () => {
        const uri = workspace.file('src', 'Heading.tsx')
        await client.openFile(uri)
        client.userInput = {
            instruction:
                'Create and export a Heading component that uses these props. Do not use default exports',
            model: 'anthropic::2024-10-22::claude-3-5-haiku-latest',
        }
        const taskId = await client.request('editTask/start', null)
        if (!taskId) {
            throw new Error('Task cannot be null or undefined')
        }

        await client.acceptEditTask(uri, taskId)
        expect(client.documentText(uri)).toMatchSnapshot()
    }, 20_000)

    it('editCommand/code (adding/deleting code)', async () => {
        const uri = workspace.file('src', 'trickyLogic.ts')
        await client.openFile(uri, { removeCursor: true })
        client.userInput = {
            instruction: 'Convert this to use a switch statement',
            model: 'anthropic::2024-10-22::claude-3-5-haiku-latest',
        }
        const taskId = await client.request('editTask/start', null)
        if (!taskId) {
            throw new Error('Task cannot be null or undefined')
        }
        await client.acceptEditTask(uri, taskId)
        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "/* SELECTION_START */
          export function trickyLogic(a: number, b: number): number {
              switch (true) {
                  case a === 0:
                      return 1
                  case b === 2:
                      return 1
                  default:
                      return a - b
              }
          }
          /* SELECTION_END */
          "
        `,
            explainPollyError
        )
    }, 20_000)

    it('editCommand/code (SQL query completion - no duplication bug)', async () => {
        const uri = workspace.file('src', 'query.sql')
        await client.openFile(uri, { removeCursor: true })
        client.userInput = {
            instruction: 'add missing code',
            model: 'anthropic::2024-10-22::claude-3-5-haiku-latest',
        }
        const taskId = await client.request('editTask/start', null)
        if (!taskId) {
            throw new Error('Task cannot be null or undefined')
        }
        await client.acceptEditTask(uri, taskId)

        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "-- divide price and gst by 10
          select audit_open('COM-1351-luke');
          update products.fee
          set gst = gst / 10
          where last_updated_by = 'COM-1351';
          "
        `
        )
    }, 20_000)
})
