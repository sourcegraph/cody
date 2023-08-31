import { execSync, spawnSync } from 'child_process'

import { MAX_RECIPE_INPUT_TOKENS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { Message } from '../../sourcegraph-api'
import { Interaction } from '../transcript/interaction'
import { reformatBotMessage } from '../viewHelpers'

import { Recipe, RecipeContext, RecipeID } from './recipe'

export class GitAnything implements Recipe {
    public id: RecipeID = 'git-anything'
    public title = 'Git Anything'
    public fast = true

    public static readonly gitDocPrompt = `
- You are a senior software engineer who is an expert at using Git.
- Your task is to take a request from a user and produce the correct Git commands to help them achieve their goal.
- You should think step-by-step before responding with the correct commands.
- You have Git documentation open in front of you.

Git documentation:
{gitDocs}

{promptInstruction}
    `

    public getHighLevelCommand(userInstruction: string): Message[] {
        const gitCommandsHighLevel = spawnSync('git', ['help', '-a'])
        const gitLogOutput = gitCommandsHighLevel.stdout?.toString().trim()
        const promptMessage = GitAnything.gitDocPrompt
            .replace('{gitDocs}', gitLogOutput)
            .replace(
                '{promptInstruction}',
                'You instruction is to produce the Git command that should be used. For example "git add", "git diff", "git grep" and so on. DO NOT INCLUDE ANY FLAGS IN YOUR COMMAND'
            )

        return [
            {
                speaker: 'human',
                text: promptMessage,
            },
            {
                speaker: 'assistant',
                text: 'OK',
            },
            {
                speaker: 'human',
                text: 'give me a diff of the changes for this file',
            },
            {
                speaker: 'assistant',
                text: 'git diff',
            },
            {
                speaker: 'human',
                text: 'give me changes in this repo over the last day',
            },
            {
                speaker: 'assistant',
                text: 'git log',
            },
            {
                speaker: 'human',
                text: userInstruction,
            },
            {
                speaker: 'assistant',
                text: 'git',
            },
        ]
    }

    public getCommandDocs(gitCommand: string, userInstruction: string): Message[] {
        const gitCommandDetailed = spawnSync(`git help ${gitCommand}`)
        const gitLogOutput = gitCommandDetailed.stdout?.toString().trim()

        const promptMessage = GitAnything.gitDocPrompt
            .replace('{gitDocs}', gitLogOutput)
            .replace(
                '{promptInstruction}',
                'Your instruction is to use the above documentation to produce the detailed Git command, including any relevant flags and values, that should be executed for the users request. For example "git add -A". Only respond with the Git command that the user should run, do not provide any additional commentary.'
            )

        return [
            {
                speaker: 'human',
                text: promptMessage,
            },
            {
                speaker: 'assistant',
                text: 'OK',
            },
            {
                speaker: 'human',
                text: 'give me a diff of the changes for this file',
            },
            {
                speaker: 'assistant',
                text: 'git diff myfile.txt',
            },
            {
                speaker: 'human',
                text: 'give me changes in this repo over the last day',
            },
            {
                speaker: 'assistant',
                text: "git log --after '1 day ago'",
            },
            {
                speaker: 'human',
                text: userInstruction,
            },
            {
                speaker: 'assistant',
                text: 'git',
            },
        ]
    }

    private completeTest(messages: Message[], context: RecipeContext): Promise<string> {
        return new Promise(resolve => {
            let text = ''
            context.chat.chat(
                messages,
                {
                    onChange(content) {
                        const formattedText = reformatBotMessage(content, 'git')
                        text = formattedText
                    },
                    onComplete() {
                        resolve(text.trim())
                    },
                    onError(message) {
                        resolve(message)
                    },
                },
                {
                    fast: true,
                    maxTokensToSample: 10000,
                }
            )
        })
    }

    public async getInteraction(userInstruction: string, context: RecipeContext): Promise<Interaction | null> {
        const dirPath = context.editor.getWorkspaceRootPath()
        if (!dirPath) {
            return null
        }

        const instruction = userInstruction
        if (!instruction) {
            return null
        }

        // get init command attempt (e.g. git log --after '1 day ago')
        const initCommand = await this.completeTest(this.getHighLevelCommand(instruction), context)
        // strip down to just the specific git command (e.g. log)
        const generalCommand = initCommand.replace('git', '').trim().split(' ')[0]
        console.log('General command:', generalCommand)
        const command = await this.completeTest(this.getCommandDocs(generalCommand, instruction), context)
        console.log('Detailed command:', command)
        const executedCommand = execSync(command, { cwd: dirPath }).toString()
        const gitOutput = executedCommand.trim() ?? ''
        const gitOutputTruncated = truncateText(gitOutput, MAX_RECIPE_INPUT_TOKENS)

        console.log('git output', gitOutputTruncated)
        return Promise.resolve(
            new Interaction(
                {
                    speaker: 'human',
                    displayText: `Make sure this is formatted nicely in Markdown:\n\n ## Git Output\n\n${gitOutputTruncated}`,
                },
                {
                    speaker: 'assistant',
                },
                Promise.resolve([]),
                []
            )
        )
    }
}
