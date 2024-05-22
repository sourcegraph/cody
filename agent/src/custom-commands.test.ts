import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { explainPollyError } from './explainPollyError'
import type { CustomChatCommandResult, CustomEditCommandResult } from './protocol-alias'
import { trimEndOfLine } from './trimEndOfLine'

describe('Custom Commands', () => {
    const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))
    const animalUri = workspace.file('src', 'animal.ts')
    const sumUri = workspace.file('src', 'sum.ts')
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'customCommandsClient',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    beforeAll(async () => {
        await workspace.beforeAll()
        await client.beforeAll()
        await client.request('command/execute', { command: 'cody.search.index-update' })
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.afterAll()
    })

    // Note: needs to be the first test case so that we can control over
    // what tabs are open here.
    it('commands/custom, chat command, open tabs context', async () => {
        const trickyLogicUri = workspace.file('src', 'trickyLogic.ts')
        await client.openFile(workspace.file('src', 'squirrel.ts'))
        await client.openFile(workspace.file('src', 'sum.ts'))
        await client.openFile(workspace.file('src', 'TestLogger.ts'))
        await client.openFile(trickyLogicUri)

        const result = (await client.request('commands/custom', {
            key: '/countTabs',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result?.chatResult as string)
        expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
            `
          "Based on the file paths you provided, the files are:

          1. src/TestLogger.ts
          2. src/sum.ts
          3. src/squirrel.ts
          4. src/trickyLogic.ts"
        `
        )
    }, 30_000)

    // CODY-1766: disabled because the generated output is too unstable
    it.skip('commands/custom, chat command, adds argument', async () => {
        await client.openFile(animalUri)
        const result = (await client.request('commands/custom', {
            key: '/translate Python',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result?.chatResult as string)
        expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
            `
              "Here's the Python equivalent of the provided TypeScript interface:

              \`\`\`python
              class Animal:
                  def __init__(self, name: str, is_mammal: bool):
                      self.name = name
                      self.is_mammal = is_mammal

                  def make_animal_sound(self) -> str:
                      raise NotImplementedError("Subclasses must implement make_animal_sound method")
              \`\`\`

              In Python, we don't have the concept of an interface like in TypeScript, so we use a base class with abstract methods. The \`Animal\` class has the following:

              1. An \`__init__\` method that takes in \`name\` (a string) and \`is_mammal\` (a boolean) as parameters and initializes the respective instance attributes.
              2. A \`make_animal_sound\` method that is marked as an abstract method using \`raise NotImplementedError\`. This means that any concrete subclass of \`Animal\` must implement this method.

              To create an instance of a specific animal, you would create a subclass of \`Animal\` and implement the \`make_animal_sound\` method. For example:

              \`\`\`python
              class Dog(Animal):
                  def make_animal_sound(self) -> str:
                      return "Woof!"

              dog = Dog("Buddy", True)
              print(dog.name)  # Output: Buddy
              print(dog.is_mammal)  # Output: True
              print(dog.make_animal_sound())  # Output: Woof!
              \`\`\`

              Note that Python doesn't have a strict type system like TypeScript, so you can omit the type annotations if you prefer."
            `,
            explainPollyError
        )
    }, 30_000)

    it('commands/custom, chat command, no context', async () => {
        await client.openFile(animalUri)
        const result = (await client.request('commands/custom', {
            key: '/none',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result.chatResult as string)
        expect(trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')).toMatchInlineSnapshot(
            `"no"`,
            explainPollyError
        )
    }, 30_000)

    // The context files are presented in an order in the CI that is different
    // than the order shown in recordings when on Windows, causing it to fail.
    it('commands/custom, chat command, current directory context', async () => {
        await client.openFile(animalUri)
        const result = (await client.request('commands/custom', {
            key: '/countDirFiles',
        })) as CustomChatCommandResult
        expect(result.type).toBe('chat')
        const lastMessage = await client.firstNonEmptyTranscript(result.chatResult as string)
        const reply = trimEndOfLine(lastMessage.messages.at(-1)?.text ?? '')
        expect(reply).not.includes('.cody/ignore') // file that's not located in the src/directory
        expect(reply).toMatchInlineSnapshot(`"9"`, explainPollyError)
    }, 30_000)

    it('commands/custom, edit command, insert mode', async () => {
        await client.openFile(sumUri, { removeCursor: false })
        const result = (await client.request('commands/custom', {
            key: '/hello',
        })) as CustomEditCommandResult
        expect(result.type).toBe('edit')
        await client.taskHasReachedAppliedPhase(result.editResult)

        const originalDocument = client.workspace.getDocument(sumUri)!
        expect(trimEndOfLine(originalDocument.getText())).toMatchInlineSnapshot(
            `
          "// hello
          export function sum(a: number, b: number): number {
              /* CURSOR */
          }"
        `,
            explainPollyError
        )
    }, 30_000)

    it('commands/custom, edit command, edit mode', async () => {
        await client.openFile(animalUri)

        const result = (await client.request('commands/custom', {
            key: '/newField',
        })) as CustomEditCommandResult
        expect(result.type).toBe('edit')
        await client.taskHasReachedAppliedPhase(result.editResult)

        const originalDocument = client.workspace.getDocument(animalUri)!
        expect(trimEndOfLine(originalDocument.getText())).toMatchInlineSnapshot(`
          "export interface Animal {
              name: string
              makeAnimalSound(): string
              isMammal: boolean
              logName(): void {
                  console.log(this.name);
              }
          }"
        `)
    }, 30_000)
})
