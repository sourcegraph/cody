import path from 'node:path'
import { type ContextItem, ModelsService, PromptString } from '@sourcegraph/cody-shared'
import { glob } from 'glob'
import * as vscode from 'vscode'
import YAML from 'yaml'
import type { MessageHandler } from '../../jsonrpc-alias'
import { EvaluationDocument } from './EvaluationDocument'
import type { CodyBenchOptions } from './cody-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { LlmJudge, type LlmJudgeScore } from './llm-judge'
import { llmJudgeChatTemplate } from './llm-judge-chat-template'

interface ChatTask {
    question: string
    files?: string[]
}

export async function evaluateChatStrategy(
    client: MessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    const absoluteFiles = glob.sync(`${options.workspace}/**`, {
        ignore: ['node_modules/**'],
        nodir: true,
    })
    const chatModel = options.fixture.customConfiguration?.['cody-bench.chatModel']
    if (!chatModel) {
        throw new Error(
            'Missing cody-bench.chatModel. To fix this problem, add "customConfiguration": { "cody-bench.chatModel": "claude-3-sonnet" } to the cody-bench JSON config.'
        )
    }
    const llm = new LlmJudge(options)
    const scores: LlmJudgeScore[] = []
    const model = ModelsService.getModelByIDSubstringOrError(chatModel).model
    const files = absoluteFiles.map(file => path.relative(options.workspace, file))
    const yamlFiles = files.filter(file => file.endsWith('.yaml'))
    await evaluateEachFile(yamlFiles, options, async params => {
        const document = EvaluationDocument.from(params, options)
        const task: ChatTask = YAML.parse(params.content)
        const id = await client.request('chat/new', null)
        client.request('webview/receiveMessage', { id, message: { command: 'chatModel', model } })
        const contextFiles: ContextItem[] = []
        for (const relativePath of task.files ?? []) {
            const uri = vscode.Uri.file(path.join(path.dirname(params.uri.fsPath), relativePath))
            contextFiles.push({
                type: 'file',
                uri,
            })
        }
        const response = await client.request('chat/submitMessage', {
            id,
            message: {
                command: 'submit',
                submitType: 'user',
                text: task.question,
                contextFiles,
                addEnhancedContext: false,
            },
        })
        const range = new vscode.Range(0, 0, 0, 0)
        if (response.type === 'transcript') {
            const reply = response.messages.at(-1)
            if (reply?.text) {
                const response = PromptString.unsafe_fromLLMResponse(reply.text)
                const score = await llm.judge(llmJudgeChatTemplate({ response }))
                document.pushItem({
                    range,
                    chatReply: reply.text,
                    chatQuestion: task.question,
                    llmJudgeScore: score.scoreNumeric,
                })
                scores.push(score)
                console.log({ reply, score })
            } else {
                document.pushItem({
                    range,
                    resultError: 'no text reply. Got ' + JSON.stringify(reply, null, 2),
                })
            }
        } else {
            document.pushItem({
                range,
                resultError: 'expected a transcript. Got ' + JSON.stringify(response, null, 2),
            })
        }
        console.log({
            fixture: options.fixture.name,
            totalScore: scores.reduce((a, b) => a + (b.scoreNumeric ?? 0), 0),
        })
        return document
    })
}
