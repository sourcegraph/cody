import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange, VsCodeFixupTaskRecipeData } from '../editor/index'
import { ANSWER_TOKENS } from '../prompt/constants'
import { SourcegraphCompletionsClient } from '../sourcegraph-api/completions/client'

import { RangeExpander } from '.'

export class SourcegraphFixupRangeExpander implements RangeExpander {
    constructor(private completionsClient?: SourcegraphCompletionsClient) {}

    public async expandTheContextRange(task: VsCodeFixupTaskRecipeData): Promise<vscode.Range | null> {
        const selectionRange = task.selectionRange
        const completionsClient = this.completionsClient

        const precedingText = this.addLineNumbersToPrecedingText(task.precedingText, selectionRange)

        const trimmedprecedingText = (precedingText: string): string => {
            const lines = precedingText.split('\n')
            return lines.length > 40 ? lines.slice(20).join('\n') : precedingText
        }

        const followingText = this.addLineNumbersToFollowingText(task.followingText, selectionRange)

        const trimLast20Lines = (followingText: string): string => {
            const lines = followingText.split('\n')
            return lines.length > 40 ? lines.slice(0, -20).join('\n') : followingText
        }
        const fullText =
            '"' +
            trimmedprecedingText(precedingText) +
            '\n' +
            this.addLineNumbers(task.selectedText, selectionRange.start.line) +
            '\n' +
            trimLast20Lines(followingText) +
            '"'

        const finalPrompt = FINAL_QUESTION + fullText

        if (!completionsClient) {
            return null
        }

        const result = await new Promise<string>(resolve => {
            let responseText = ''

            completionsClient.stream(
                {
                    fast: true,
                    temperature: 1,
                    maxTokensToSample: ANSWER_TOKENS,
                    topK: -1,
                    topP: -1,
                    messages: [
                        { speaker: 'human', text: INSTRUCTION_PROMPT },
                        { speaker: 'assistant', text: ASSISTANT_RESPONSE },
                        { speaker: 'human', text: SECOND_INSTURCTION },
                        { speaker: 'assistant', text: SECOND_ASSISTANT_RESPONSE },
                        { speaker: 'human', text: finalPrompt },
                        { speaker: 'assistant' },
                    ],
                },
                {
                    onChange: (text: string) => {
                        responseText = text
                    },
                    onComplete: () => {
                        resolve(responseText)
                    },
                    onError: (message: string, statusCode?: number) => {
                        console.error(`Error detecting intent: Status code ${statusCode}: ${message}`)
                        resolve('')
                    },
                }
            )
        })
        const numbers = this.extractNumbersFromBrackets(result)
        const newEditRange = this.findEnclosingRange(numbers, selectionRange)
        const startPosition = new vscode.Position(newEditRange.start.line, 0) // 1st line, 5th character
        const endPosition = new vscode.Position(newEditRange.end.line, 0) // 3rd line, 15th character

        const myRange = new vscode.Range(startPosition, endPosition)

        return myRange
    }

    private addLineNumbers(content: string, startFrom: number = 0): string {
        return content
            .split('\n')
            .map((line, index) => `${startFrom + index} ${line}`)
            .join('\n')
    }

    private addLineNumbersToPrecedingText(
        precedingText: string,
        selectionRange: ActiveTextEditorSelectionRange
    ): string {
        const startLineNumber = selectionRange.start.line - precedingText.split('\n').length + 1
        return this.addLineNumbers(precedingText, startLineNumber)
    }

    private addLineNumbersToFollowingText(
        followingText: string,
        selectionRange: ActiveTextEditorSelectionRange
    ): string {
        const startLineNumber = selectionRange.end.line + 1
        return this.addLineNumbers(followingText, startLineNumber)
    }

    private findEnclosingRange(
        numbers: number[],
        selectionRange: ActiveTextEditorSelectionRange
    ): ActiveTextEditorSelectionRange {
        if (!numbers.length) {
            return selectionRange
        }

        let start = numbers[0]
        let end = numbers[numbers.length - 1]

        for (const num of numbers) {
            if (num <= selectionRange.start.line) {
                start = num
            }
            if (num >= selectionRange.end.line) {
                end = num
                break
            }
        }

        // If the selection range is outside the numbers array range
        if (selectionRange.start.line < start && selectionRange.end.line > end) {
            return selectionRange
        }
        const newEditRange: ActiveTextEditorSelectionRange = {
            start: {
                line: start,
                character: 0,
            },
            end: {
                line: end,
                character: 0,
            },
        }
        return newEditRange // Assuming column numbers remain 0 for simplicity
    }

    private extractNumbersFromBrackets(input: string): number[] {
        const numbers: number[] = []
        let isInBrackets = false
        let tempNum = ''

        for (const char of input) {
            if (char === '[') {
                isInBrackets = true
                tempNum = ''
            } else if (char === ']') {
                isInBrackets = false
                numbers.push(parseInt(tempNum, 10))
            } else if (isInBrackets && !isNaN(parseInt(char, 10))) {
                tempNum += char
            }
        }
        numbers.sort((a, b) => a - b)

        return numbers
    }
}

const INSTRUCTION_PROMPT = `
Given the following code snippet, identify all functions in this code snippet

For example:
In JavaScript:
\`\`\`
1 function complete() {
2    return true;
3 }
4 function incomplete() {
\`\`\`

should return -> complete StartLineNumber: [1], EndLineNumber: [3]\n incomplete StartLineNumber: [4], EndLineNumber: [4]

In Python:
\`\`\`
1 def complete():
2     return True
3 def incomplete():
\`\`\`

should return -> complete StartLineNumber: [1], EndLineNumber: [2]\n incomplete StartLineNumber: [3], EndLineNumber: [3]

Now, for the given code:
"
4    public async getInteraction(taskId: string, context: RecipeContext): Promise<Interaction | null> {
5        const fixupController = context.editor.controllers?.fixups
6        if (!fixupController) {
7            return null
8        }
24        const promptText = this.getPrompt(fixupTask, intent)
25
26        return Promise.resolve(
27            new Interaction(
28
38            )
39        )
40    }
41
42    private async getIntent(task: VsCodeFixupTaskRecipeData, context: RecipeContext): Promise<FixupIntent> {
54        const intent = await context.intentDetector.classifyIntentFromOptions(
55            task.instruction,
56            FixupIntentClassification,
57            'edit'
58        )
59        return intent
60    }
61
62    public getPrompt(task: VsCodeFixupTaskRecipeData): string {
70        const promptInstruction = truncateText(task.instruction, MAX_HUMAN_INPUT"
Please identify all  functions and provide their starting and ending line numbers in the format:
<FunctionName> StartLineNumber: [LineNumber], EndLineNumber: [LineNumber]
`
const ASSISTANT_RESPONSE =
    'getInteraction StartLineNumber: [4], EndLineNumber: [40]\ngetIntent StartLineNumber: [42], EndLineNumber: [60]\ngetPrompt StartLineNumber: [62], EndLineNumber: [72]'

const FINAL_QUESTION = `
Given the following code snippet, identify all functions  =>
`
const SECOND_INSTURCTION = `
Given the following code snippet:

1    constructor(options: MessageProviderOptions) {
    2        super()
    3
    22        this.contextProvider.configurationChangeEvent.event(() => this.sendCodyCommands())
    23    }
    24
    25    protected async init(): Promise<void> {
    31        await this.sendCodyCommands()
    32    }
    33
    34    public async clearAndRestartSession(): Promise<void> {
    43        this.telemetryService.log('CodyVSCodeExtension:chatReset:executed')
    44    }
    45
    46    public async clearHistory(): Promise<void> {
    51        this.transcript = new Transcript()

Please identify all  functions and provide their starting and ending line numbers in the format:
<FunctionName> StartLineNumber: [LineNumber], EndLineNumber: [LineNumber]
`
const SECOND_ASSISTANT_RESPONSE = `
constructor StartLineNumber: [1], EndLineNumber: [23]
init StartLineNumber: [25], EndLineNumber: [32]
clearAndRestartSession StartLineNumber: [34], EndLineNumber: [44]
clearHistory StartLineNumber: [46], EndLineNumber: [51]
`
