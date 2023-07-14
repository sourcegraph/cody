import * as vscode from 'vscode'

import { CodyPromptContext, defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { isInternalUser } from '../chat/protocol'

import { MyToolsProvider } from './MyToolsProvider'

interface MyPromptsConfig {
    recipes: { [id: string]: CodyPrompt }
    premade?: CodyPromptPremade
}

interface CodyPrompt {
    prompt: string
    command?: string
    args?: string[]
    context?: CodyPromptContext
    type?: CodyPromptType
}

interface CodyPromptPremade {
    actions: string
    rules: string
    answer: string
}

type CodyPromptType = 'workspace' | 'user'

const MY_CODY_PROMPTS_KEY = 'my-cody-prompts'

// NOTE: Dogfooding - Internal s2 users only
export class MyPromptController {
    private myPremade: Message[] | null = null
    private myPromptStore = new Map<string, CodyPrompt>()

    private tools: MyToolsProvider
    private builder: MyRecipesBuilder

    private myPromptInProgress: CodyPrompt | null = null
    private promptInProgress: string | null = null
    private dev = false
    public fileWatcher: vscode.FileSystemWatcher | null = null

    constructor(
        private debug: (filterLabel: string, text: string, ...args: unknown[]) => void,
        private context: vscode.ExtensionContext,
        endpoint: string | null
    ) {
        this.debug('MyPromptsProvider', 'Initialized')
        this.isDev(endpoint)

        this.tools = new MyToolsProvider(context)
        const user = this.tools.getUserInfo()
        this.builder = new MyRecipesBuilder(context.globalState, user?.workspaceRoot || null)
        if (user?.workspaceRoot && this.dev) {
            const fileName = '.vscode/cody.json'
            const watchPattern = new vscode.RelativePattern(user.workspaceRoot, fileName)
            const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
            this.fileWatcher = watcher
        }
        this.refresh().catch(error => console.error(error))
    }

    private isDev(uri: string | null): boolean {
        this.dev = isInternalUser(uri || '')
        return this.dev
    }

    // getter for the promptInProgress
    public get(type?: string): string | null {
        if (type === 'context') {
            const contextConfig = this.myPromptInProgress?.context
            return JSON.stringify(contextConfig || defaultCodyPromptContext)
        }
        if (type === 'codebase') {
            return this.myPromptInProgress?.context?.codebase ? 'codebase' : null
        }
        // return the terminal output from the last command run
        return this.getCommandOutput() || null
    }

    // Find the prompt based on the id
    public find(id: string): string {
        const myPrompt = this.myPromptStore.get(id)
        this.myPromptInProgress = myPrompt || null
        this.promptInProgress = myPrompt?.prompt || ''
        return this.promptInProgress
    }

    public run(command: string, args?: string[]): string | null {
        return this.tools.runCommand(command, args)
    }

    public setCodebase(codebase?: string): void {
        this.builder.codebase = codebase || null
    }

    // get the list of recipe names to share with the webview to display
    // we will then use the selected recipe name to get the prompt during the recipe execution step
    public getPromptList(): string[] {
        return this.builder.getIDs()
    }

    // Get the prompts and premade for client to use
    public getMyPrompts(): { prompts: Map<string, CodyPrompt> | null; premade: Message[] | null } {
        return { prompts: this.myPromptStore, premade: this.myPremade }
    }

    public getCommandOutput(): string | null {
        if (!this.myPromptInProgress) {
            return null
        }
        const { command, args } = this.myPromptInProgress
        if (!command || !args) {
            return null
        }
        return this.tools.runCommand(command, args)
    }

    // Save the user prompts to the extension storage
    public async save(id: string, prompt: CodyPrompt, deletePrompt = false): Promise<void> {
        if (deletePrompt) {
            this.myPromptStore.delete(id)
        } else {
            this.myPromptStore.set(id, prompt)
        }
        // filter prompt map to remove prompt with type workspace
        const filtered = new Map<string, CodyPrompt>()
        for (const [key, value] of this.myPromptStore) {
            if (value.type !== 'workspace') {
                filtered.set(key, value)
            }
        }
        // turn prompt map into json
        const jsonString = JSON.stringify({ recipes: Object.fromEntries(filtered) })
        await this.context.globalState.update(MY_CODY_PROMPTS_KEY, jsonString)
    }

    // Get the prompts from cody.json file then build the map of prompts
    public async refresh(): Promise<void> {
        // NOTE: Internal s2 users only
        if (!this.dev) {
            return
        }
        this.myPromptStore = await this.builder.get()
    }

    public async clear(): Promise<void> {
        await this.context.globalState.update(MY_CODY_PROMPTS_KEY, null)
    }

    public async add(): Promise<void> {
        // Get the prompt name and prompt description from the user using the input box with 2 steps
        const promptName = await vscode.window.showInputBox({
            title: 'Creating a new custom recipe...',
            prompt: 'Enter an unique name for the new recipe.',
            placeHolder: 'e,g. Vulnerability Scanner',
            validateInput: (input: string) => {
                if (!input || input === 'add' || input === 'clear') {
                    return 'Please enter a valid name for the recipe.'
                }
                if (this.myPromptStore.has(input)) {
                    return 'A recipe with the same name already exists. Please enter a different name.'
                }
                return
            },
        })
        if (!promptName) {
            return
        }
        const promptDescription = await vscode.window.showInputBox({
            title: 'Creating a new custom recipe...',
            prompt: 'Enter a prompt for the recipe.',
            placeHolder: "e,g. 'Create five different test cases for the selected code''",
            validateInput: (input: string) => {
                if (!input) {
                    return 'Please enter a prompt description.'
                }
                return
            },
        })
        if (!promptDescription) {
            void vscode.window.showErrorMessage('Invalid values.')
            return
        }
        const newPrompt: CodyPrompt = { prompt: promptDescription }
        const promptCommand = await vscode.window.showInputBox({
            title: 'Creating a new custom recipe...',
            prompt: '[Optional] Add a terminal command for the recipe to run from your current workspace. The output will be shared with Cody as context for the prompt. (The added command must work on your local machine.)',
            placeHolder: 'e,g. node your-script.js, git describe --long, cat src/file-name.js etc.',
        })
        if (promptCommand) {
            const commandParts = promptCommand.split(' ')
            if (!commandParts.length) {
                return
            }
            newPrompt.command = commandParts.shift()
            newPrompt.args = commandParts
        }
        this.myPromptStore.set(promptName, newPrompt)
        // Save the prompt to the extension storage
        await this.save(promptName, newPrompt)
    }
}

class MyRecipesBuilder {
    public myPremade: Message[] | null = null
    public myPromptsMap = new Map<string, CodyPrompt>()
    public idSet = new Set<string>()

    public codebase: string | null = null

    constructor(private globalState: vscode.Memento, private workspaceRoot: string | null) {}

    public async get(): Promise<Map<string, CodyPrompt>> {
        // reset map and set
        this.myPromptsMap = new Map<string, CodyPrompt>()
        this.idSet = new Set<string>()
        // user prompts
        const storagePrompts = this.getPromptsFromExtensionStorage()
        this.build(storagePrompts, 'user')
        // workspace prompts
        const wsPrompts = await this.getPromptsFromWorkspace(this.workspaceRoot)
        this.build(wsPrompts, 'workspace')

        return this.myPromptsMap
    }

    public getIDs(): string[] {
        return [...this.idSet]
    }

    public build(content: string | null, type: CodyPromptType): Map<string, CodyPrompt> | null {
        if (!content) {
            return null
        }
        const json = JSON.parse(content) as MyPromptsConfig
        const prompts = json.recipes
        for (const key in prompts) {
            if (Object.prototype.hasOwnProperty.call(prompts, key)) {
                const prompt = prompts[key]
                prompt.type = type
                this.myPromptsMap.set(key, prompt)
                this.idSet.add(key)
            }
        }
        this.makeMyPremade(json.premade || null)

        return this.myPromptsMap
    }

    private getPromptsFromExtensionStorage(): string {
        return this.globalState.get(MY_CODY_PROMPTS_KEY) as string
    }

    private async getPromptsFromWorkspace(workspaceRoot: string | null): Promise<string | null> {
        if (!workspaceRoot) {
            return null
        }
        try {
            const fileName = '.vscode/cody.json'
            const filePath = vscode.Uri.file(`${workspaceRoot}/${fileName}`)
            const bytes = await vscode.workspace.fs.readFile(filePath)
            const decoded = new TextDecoder('utf-8').decode(bytes) || null
            return decoded
        } catch {
            return null
        }
    }

    private makeMyPremade(premade: CodyPromptPremade | null): void {
        if (!premade) {
            return
        }
        const { actions, rules, answer } = premade
        const preamble = [actions, rules]
        const preambleResponse = [answer]
        const codebase = this.codebase
        if (codebase) {
            const codebasePreamble =
                `You have access to the \`${codebase}\` repository. You are able to answer questions about the \`${codebase}\` repository. ` +
                `I will provide the relevant code snippets from the \`${codebase}\` repository when necessary to answer my questions.`

            preamble.push(codebasePreamble)
            preambleResponse.push(
                `I have access to the \`${codebase}\` repository and can answer questions about its files.`
            )
        }

        this.myPremade = [
            {
                speaker: 'human',
                text: preamble.join('\n\n'),
            },
            {
                speaker: 'assistant',
                text: preambleResponse.join('\n'),
            },
        ]
    }
}
