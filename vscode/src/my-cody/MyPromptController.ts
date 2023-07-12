import * as vscode from 'vscode'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { LocalStorage } from '../services/LocalStorageProvider'

import { MyToolsProvider } from './MyToolsProvider'

interface MyPromptsConfig {
    recipes: { [id: string]: CodyPrompt }
    premade?: CodyPromptPremade
}

interface CodyPrompt {
    prompt: string
    command?: string
    args?: string[]
    context?: {
        codebase: boolean
        openTabs?: boolean
    }
}

interface CodyPromptPremade {
    actions: string
    rules: string
    answer: string
}

export class MyPromptController {
    private promptStore = new Map<string, string>()
    private myPromptStore = new Map<string, CodyPrompt>()
    private promptIDs = new Set<string>()
    private raw: string | null = null
    private myPrompts: MyPromptsConfig | null = null
    private tools: MyToolsProvider
    private codebase: string | null = null
    private myPromptInProgress: CodyPrompt | null = null
    private promptInProgress: string | null = null
    private dev = false
    public fileWatcher: vscode.FileSystemWatcher | null = null

    constructor(
        private debug: (filterLabel: string, text: string, ...args: unknown[]) => void,
        private context: vscode.ExtensionContext,
        localStorage: LocalStorage
    ) {
        this.debug('MyPromptsProvider', 'Initialized')
        // NOTE: Internal s2 users only
        this.dev = localStorage.getEndpoint() === 'https://sourcegraph.sourcegraph.com/'
        this.tools = new MyToolsProvider(context)
        this.refresh().catch(error => console.error(error))
        const user = this.tools.getUserInfo()
        if (user?.workspaceRoot) {
            const fileName = '.vscode/cody.json'
            const watchPattern = new vscode.RelativePattern(user.workspaceRoot, fileName)
            const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
            this.fileWatcher = watcher
        }
    }

    // getter for the promptInProgress
    public get(type?: string): string | null {
        if (type === 'context') {
            return this.myPromptInProgress?.context?.codebase ? 'codebase' : null
        }
        // return the terminal output from the last command run
        return this.getCommandOutput() || this.raw
    }

    public run(command: string, args?: string[]): string | null {
        return this.tools.runCommand(command, args)
    }

    public setCodebase(codebase?: string): void {
        this.codebase = codebase || null
    }

    // get the list of recipe names to share with the webview to display
    // we will then use the selected recipe name to get the prompt during the recipe execution step
    public getPromptList(): string[] {
        return [...this.promptIDs]
    }

    // Find the prompt based on the id
    public find(id: string): string {
        const myPrompt = this.myPromptStore.get(id)
        this.myPromptInProgress = myPrompt || null
        this.promptInProgress = myPrompt?.prompt || ''
        return this.promptInProgress
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

    // Save the prompts to the extension storage
    public async save(id: string, prompt: string): Promise<void> {
        this.promptStore.set(id, prompt)
        await this.context.globalState.update('prompts', this.promptStore)
    }

    // Get the prompts and premade for client to use
    public getMyPrompts(): { prompts: Map<string, CodyPrompt> | null; premade: Message[] | null } {
        return {
            prompts: this.myPromptStore,
            premade: this.makeMyPremade(),
        }
    }

    // Create a map of prompts from the json file
    private async makeMyPrompts(): Promise<Map<string, CodyPrompt> | null> {
        const fileContent = await this.getUserFileFromExtensionStorage()
        this.promptIDs = new Set<string>()
        if (!fileContent) {
            return null
        }
        const json = JSON.parse(fileContent) as MyPromptsConfig
        const map = new Map<string, CodyPrompt>()
        const prompts = json.recipes
        for (const key in prompts) {
            if (Object.prototype.hasOwnProperty.call(prompts, key)) {
                map.set(key, prompts[key])
                this.promptIDs.add(key)
            }
        }
        this.myPrompts = json
        this.myPromptStore = map
        return map || null
    }

    public makeMyPremade(): Message[] | null {
        if (!this.myPrompts?.premade) {
            return null
        }
        const { actions, rules, answer } = this.myPrompts?.premade
        const preamble = [actions, rules]
        const preambleResponse = [answer]

        if (this.codebase) {
            const codebase = this.codebase
            const codebasePreamble =
                `You have access to the \`${codebase}\` repository. You are able to answer questions about the \`${codebase}\` repository. ` +
                `I will provide the relevant code snippets from the \`${codebase}\` repository when necessary to answer my questions.`

            preamble.push(codebasePreamble)
            preambleResponse.push(
                `I have access to the \`${codebase}\` repository and can answer questions about its files.`
            )
        }

        return [
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

    // Dev mode allows devs to make changes to the preamble for testing purposes
    private async getUserFileFromExtensionStorage(): Promise<string | null> {
        const user = this.tools.getUserInfo()
        if (!user.workspaceRoot) {
            return null
        }
        try {
            const fileName = '.vscode/cody.json'
            const filePath = vscode.Uri.file(`${user.workspaceRoot}/${fileName}`)
            const bytes = await vscode.workspace.fs.readFile(filePath)
            const decoded = new TextDecoder('utf-8').decode(bytes) || null
            this.raw = decoded
            return decoded
        } catch (error) {
            console.error(error)
            return null
        }
    }

    // NOTE: Internal s2 users only
    public async refresh(): Promise<void> {
        if (!this.dev) {
            return
        }
        await this.makeMyPrompts()
    }
}
