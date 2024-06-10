import path from 'node:path'
import { ModelsService, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { explainPollyError } from './explainPollyError'
import { trimEndOfLine } from './trimEndOfLine'

describe('Edit', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'edit',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    beforeAll(async () => {
        ModelsService.setModels(getDotComDefaultModels())
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
        expect(lenses).toHaveLength(0)
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

    it('editCommand/code (add prop types)', async () => {
        const uri = workspace.file('src', 'ChatColumn.tsx')
        await client.openFile(uri)
        const task = await client.request('editCommands/code', {
            instruction: 'Add types to these props. Introduce new interfaces as necessary',
            model: ModelsService.getModelByIDSubstringOrError('anthropic/claude-3-opus').model,
        })
        await client.acceptEditTask(uri, task)
        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "import { useEffect } from "react";
          import React = require("react");

          export default function ChatColumn({
          	messages,
          	setChatID,
          	isLoading,
          }: {
          	messages: Message[];
          	setChatID: (chatID: string) => void;
          	isLoading: boolean;
          }) {
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
            model: ModelsService.getModelByIDSubstringOrError('anthropic/claude-3-opus').model,
        })
        await client.acceptEditTask(uri, task)
        expect(client.documentText(uri)).toMatchInlineSnapshot(
            `
          "import React = require("react");

          interface HeadingProps {
              text: string;
              level?: number;
          }

          /* Based on the provided code, we have:
          - An import of the React module
          - An interface \`HeadingProps\` that defines the expected props for a Heading component:
            - \`text\` prop of type string
            - optional \`level\` prop of type number
          To create the Heading component:
          1. Define a functional component named \`Heading\` that accepts \`props\` of type \`HeadingProps\`
          2. Determine the heading level based on the \`level\` prop, defaulting to \`1\` if not provided
          3. Render the appropriate heading element (\`<h1>\` to \`<h6>\`) based on the level, with the \`text\` prop as the content
          4. Export the \`Heading\` component using a named export
          */

          export const Heading: React.FC<HeadingProps> = ({ text, level = 1 }) => {
            const HeadingTag = \`h\${level}\` as keyof JSX.IntrinsicElements;

            return <HeadingTag>{text}</HeadingTag>;
          };

          "
        `,
            explainPollyError
        )
    }, 20_000)
})
