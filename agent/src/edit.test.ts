import path from 'node:path'
import { getDotComDefaultModels, modelsService, ps } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll } from 'vitest'
import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import { executeSmartApply } from '../../vscode/src/edit/smart-apply'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { AgentFixupControls } from './AgentFixupControls'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { explainPollyError } from './explainPollyError'
import { trimEndOfLine } from './trimEndOfLine'

describe('Edit', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'edit-code'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'edit',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    beforeAll(async () => {
        modelsService.setModels(getDotComDefaultModels())
        await workspace.beforeAll()
        await client.beforeAll()
        await client.request('command/execute', { command: 'cody.search.index-update' })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    it('editCommands/code (basic function)', async () => {
        const uri = workspace.file('src', 'sum.ts')
        await client.openFile(uri, { removeCursor: false })
        const task = await client.request('editCommands/code', {
            instruction: 'Rename `a` parameter to `c`',
        })
        await client.taskHasReachedAppliedPhase(task)
        const lenses = client.codeLenses.get(uri.toString()) ?? []
        expect(lenses).toHaveLength(2)
        await client.request('editTask/accept', { id: task.id })
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

    it('editCommands/code (having one file active apply to the other file)', async () => {
        const initiallyActiveFileUri = workspace.file('src', 'sum.ts')
        await client.openFile(initiallyActiveFileUri)

        const fileToEditUri = workspace.file('src', 'a-new-file.ts')
        const newDocument = { uri: fileToEditUri } as vscode.TextDocument

        const fixupTask = await executeSmartApply({
            configuration: {
                id: 'test-task-id',
                instruction: ps`Add a simple function`,
                replacement: '',
                document: newDocument,
                model: undefined,
                isNewFile: true,
            },
            source: 'chat',
        })
        const task = AgentFixupControls.serialize(fixupTask!)

        const initiallyActiveFileLenses = client.codeLenses.get(initiallyActiveFileUri.toString()) ?? []
        const fileToEditLenses = client.codeLenses.get(fileToEditUri.toString()) ?? []
        expect(initiallyActiveFileLenses).toHaveLength(0)
        expect(fileToEditLenses).toHaveLength(4)
        expect(fileToEditLenses[0].command?.command).toBe('cody.fixup.codelens.accept')
        await client.request('editTask/accept', { id: task.id })
        const newContent = client.workspace.getDocument(fileToEditUri)?.content
        expect(trimEndOfLine(newContent)).toMatchInlineSnapshot(
            `
                    "export function sum(c: number, b: number): number {
                        /* CURSOR */
                    }
                    "
                    `,
            explainPollyError
        )
    }, 10000)

    it('editCommand/code (add prop types)', async () => {
        const uri = workspace.file('src', 'ChatColumn.tsx')
        await client.openFile(uri)
        const task = await client.request('editCommands/code', {
            instruction: 'Add types to these props. Introduce new interfaces as necessary',
            model: modelsService.getModelByIDSubstringOrError('anthropic/claude-3-5-sonnet-20240620').id,
        })
        await client.acceptEditTask(uri, task)
        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "import { useEffect } from "react";
          import React = require("react");

          interface Message {
          	chatID: string
          	text: string
          }

          interface ChatColumnProps {
          	messages: Message[]
          	setChatID: (chatID: string) => void
          	isLoading: boolean
          }

          export default function ChatColumn({
          	messages,
          	setChatID,
          	isLoading,
          }: ChatColumnProps) {
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

    it('editCommand/code (generate new code)', async () => {
        const uri = workspace.file('src', 'Heading.tsx')
        await client.openFile(uri)
        const task = await client.request('editCommands/code', {
            instruction:
                'Create and export a Heading component that uses these props. Do not use default exports',
            model: modelsService.getModelByIDSubstringOrError('anthropic/claude-3-5-sonnet-20240620').id,
        })
        await client.acceptEditTask(uri, task)
        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "import React = require("react");

          interface HeadingProps {
              text: string;
              level?: number;
          }

          export const Heading: React.FC<HeadingProps> = ({ text, level = 1 }) => {
              const HeadingTag = \`h\${level}\` as keyof JSX.IntrinsicElements;

              return <HeadingTag>{text}</HeadingTag>;
          };

          "
        `,
            explainPollyError
        )
    }, 20_000)

    it('editCommand/code (adding/deleting code)', async () => {
        const uri = workspace.file('src', 'trickyLogic.ts')
        await client.openFile(uri, { removeCursor: true })
        const task = await client.request('editCommands/code', {
            instruction: 'Convert this to use a switch statement',
            model: modelsService.getModelByIDSubstringOrError('anthropic/claude-3-opus').id,
        })
        await client.acceptEditTask(uri, task)
        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "export function trickyLogic(a: number, b: number): number {
              switch (true) {
                  case a === 0:
                      return 1
                  case b === 2:
                      return 1
                  default:
                      return a - b
              }
          }
          "
        `,
            explainPollyError
        )
    }, 20_000)
})
