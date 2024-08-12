import path from 'node:path'
import { type ContextItem, PromptString, isDefined } from '@sourcegraph/cody-shared'
import { glob } from 'glob'
import * as vscode from 'vscode'
import YAML from 'yaml'
import type { RpcMessageHandler } from '../../jsonrpc-alias'
import { EvaluationDocument } from './EvaluationDocument'
import type { CodyBenchOptions } from './command-bench'
import { evaluateEachFile } from './evaluateEachFile'
import { LlmJudge, type LlmJudgeScore } from './llm-judge'
import { concisenessPrompt, helpfulnessPrompt } from './llm-judge-chat-template'

interface ChatTask {
    question: string
    class: string
    files?: string[]
}

export async function evaluateChatStrategy(
    client: RpcMessageHandler,
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
    const files = absoluteFiles.map(file => path.relative(options.workspace, file))
    const yamlFiles = files.filter(file => file.endsWith('question.yaml'))
    await evaluateEachFile(yamlFiles, options, async params => {
        const document = EvaluationDocument.from(params, options)
        const task: ChatTask = YAML.parse(params.content)
        const id = await client.request('chat/new', null)
        client.request('webview/receiveMessage', {
            id,
            message: { command: 'chatModel', model: chatModel },
        })
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
                addEnhancedContext: isDefined(options.context),
            },
        })
        const range = new vscode.Range(0, 0, 0, 0)
        if (response.type === 'transcript') {
            const query = response.messages.at(0)
            const reply = response.messages.at(-1)
            if (reply?.text) {
                const llmResponse = PromptString.unsafe_fromLLMResponse(reply.text)
                const score = await llm.judge(helpfulnessPrompt({ response: llmResponse }))
                const concisenessScore = await llm.judge(concisenessPrompt({ response: llmResponse }))
                const contextItems = query?.contextFiles?.map(i => ({
                    source: i.source,
                    file: i.uri.path + `:${i.range?.start.line}-${i.range?.end.line}`,
                    content: i.content,
                }))

                document.pushItem({
                    range,
                    chatReply: reply.text,
                    chatQuestion: task.question,
                    contextItems: contextItems,
                    questionClass: task.class,
                    llmJudgeScore: score.scoreNumeric,
                    concisenessScore: concisenessScore.scoreNumeric,
                    hedges: checkHedging(reply.text),
                })
                scores.push(score)
                console.log({ reply, score, concisenessScore })
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

const apologyCheck = /sorry|apologize|unfortunately/i
const accessCheck =
    /I (don't|do not) (actually )?have (direct )?access|your actual codebase|can't browse external repositories|not able to access external information|unable to browse through|directly access|direct access|snippet you provided is incomplete|I can't review|don't see any information|no specific information/i

function checkHedging(reply: string): boolean {
    return apologyCheck.test(reply) || accessCheck.test(reply)
}
