import * as vscode from 'vscode'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { MyToolsProvider } from './MyToolsProvider'

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

    constructor(
        private debug: (filterLabel: string, text: string, ...args: unknown[]) => void,
        private context: vscode.ExtensionContext
    ) {
        this.debug('MyPromptsProvider', 'Initialized')
        this.tools = new MyToolsProvider(context)
        this.refresh().catch(error => console.error(error))
        this.dev = process.env.CODY_PROMPTS_DEV === 'true'
        const user = this.tools.getUserInfo()
        // TODO (bee) update recipe list in UI on file change
        if (user?.workspaceRoot) {
            const fileName = '.vscode/cody.json'
            const watchPattern = new vscode.RelativePattern(user.workspaceRoot, fileName)
            const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
            watcher.onDidCreate(() => this.refresh().catch(error => this.debug('MyPromptsProvider:watcher', error)))
            watcher.onDidChange(() => this.refresh().catch(error => this.debug('MyPromptsProvider:watcher', error)))
        }
    }

    // get the terminal output from the last command run
    public get(): string | null {
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
        if (this.dev) {
            const myPrompt = this.myPromptStore.get(id)
            this.myPromptInProgress = myPrompt || null
            this.promptInProgress = myPrompt?.prompt || ''
            return this.promptInProgress
        }
        const prompt = this.promptStore.get(id) || ''
        this.promptInProgress = prompt
        return prompt
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
            premade: this.getMyPremade(),
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
        const prompts = json.prompts
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

    public getMyPremade(): Message[] | null {
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
            const fileName = 'cody.json'
            const filePath = vscode.Uri.file(`${user.workspaceRoot}/.vscode/${fileName}`)
            const bytes = await vscode.workspace.fs.readFile(filePath)
            const decoded = new TextDecoder('utf-8').decode(bytes) || null
            this.raw = decoded
            return decoded
        } catch {
            return null
        }
    }

    public async refresh(): Promise<void> {
        await this.makeMyPrompts()
    }
}

interface MyPromptsConfig {
    prompts: { [id: string]: CodyPrompt }
    premade?: CodyPromptPremade
}

interface CodyPrompt {
    name: string
    prompt: string
    command?: 'git' | 'fileSystem' | undefined
    args?: string[]
}

interface CodyPromptPremade {
    actions: string
    rules: string
    answer: string
}
