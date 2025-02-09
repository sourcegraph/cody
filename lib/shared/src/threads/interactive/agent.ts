import { Observable } from 'observable-fns'
import {
    debounceTime,
    distinctUntilChanged,
    filter,
    lastValueFrom,
    mergeMap,
    promiseFactoryToObservable,
    startWith,
    tap,
} from '../../misc/observable'
import { registerBuiltinTools } from './builtin-tools'
import { type InteractiveThread, type ThreadID, type ThreadStep, newThreadStepID } from './thread'
import type { InteractiveThreadService } from './thread-service'
import { type ToolInvocation, toolService } from './tool-service'

export function createAgentForInteractiveThread(
    threadService: InteractiveThreadService,
    threadID: ThreadID
): Observable<AgentState> {
    registerBuiltinTools(toolService)

    const thread = threadService.observe(threadID, {})
    return thread.pipe(
        distinctUntilChanged(),
        debounceTime(1000),
        mergeMap(thread => {
            const workItem = workItemFromThread(thread)
            const agentState = agentStateFromThread(thread)
            console.log('WORKITEM', workItem, 'AGENTSTATE', agentState)
            if (workItem) {
                // Run async and do not await.
                //
                // TODO!(sqs): error handling
                return promiseFactoryToObservable(signal =>
                    handle(threadService, thread, workItem, signal)
                ).pipe(
                    startWith(agentState),
                    filter(s => !!s)
                )
            }

            return Observable.of(agentState)
        })
    )
}

type AgentWorkItem =
    | { type: 'new-human-message'; step: Extract<ThreadStep, { type: 'human-message' }> }
    | { type: 'continue-agent' }
    | { type: 'call-tool'; step: ThreadStep; invocation: ToolInvocation }

function workItemFromThread(thread: InteractiveThread): AgentWorkItem | null {
    const lastStep = thread.steps.at(-1)
    if (!lastStep) {
        return null
    }

    const newHumanMessage = lastStep.type === 'human-message' ? lastStep : null
    if (newHumanMessage) {
        return { type: 'new-human-message', step: newHumanMessage }
    }

    if (lastStep.type === 'tool') {
        const invocation = thread.toolInvocations?.[lastStep.id]
        if (!invocation) {
            throw new Error('invocation not found')
        }
        if (invocation.invocation.status !== 'done') {
            return { type: 'call-tool', step: lastStep, invocation }
        }
    }

    if (lastStep.type === 'agent-turn-done') {
        return null
    }

    return { type: 'continue-agent' }
}

export type AgentState =
    | 'waiting-for-human-message'
    | 'blocked-on-user-input-for-tool-call'
    | 'tool-call-in-progress'
    | 'working'

function agentStateFromThread(thread: InteractiveThread): AgentState {
    if (thread.steps.length === 0) {
        return 'waiting-for-human-message'
    }

    // Check if any tools are blocked on user input.
    const blockedInvocation =
        thread.toolInvocations &&
        Object.entries(thread.toolInvocations).find(
            ([, { invocation }]) => invocation.status === 'blocked-on-user'
        )
    if (blockedInvocation) {
        return 'blocked-on-user-input-for-tool-call'
    }

    // Check if any tools are running.
    const inProgressInvocation =
        thread.toolInvocations &&
        Object.entries(thread.toolInvocations).find(
            ([, { invocation }]) => invocation.status === 'in-progress'
        )
    if (inProgressInvocation) {
        return 'tool-call-in-progress'
    }

    if (thread.steps.at(-1)?.type === 'agent-turn-done') {
        return 'waiting-for-human-message'
    }

    return 'working'
}

async function handle(
    threadService: InteractiveThreadService,
    thread: InteractiveThread,
    workItem: AgentWorkItem,
    signal: AbortSignal
): Promise<void> {
    if (workItem.type === 'call-tool') {
        if (workItem.step.type !== 'tool') {
            throw new Error('unexpected step type')
        }

        await lastValueFrom(
            toolService
                .invokeTool(workItem.step.tool, {
                    args: workItem.invocation.args,
                    userInput: workItem.invocation.userInput,
                })
                .pipe(
                    tap(invocation => {
                        threadService.update(thread.id, {
                            type: 'update-tool-invocation',
                            step: workItem.step.id,
                            invocation,
                        })
                    })
                )
        )
        signal.throwIfAborted()
    } else if (workItem.type === 'new-human-message') {
        await sleep(500)
        signal.throwIfAborted()

        threadService.update(thread.id, {
            type: 'append-agent-steps',
            steps: [
                {
                    id: newThreadStepID(),
                    type: 'agent-message',
                    content: 'Let me see what files already exist.',
                },
                {
                    id: newThreadStepID(),
                    type: 'tool',
                    tool: 'read-files',
                    args: {
                        files: [
                            'index.ts',
                            'package.json',
                            'src/main.ts',
                            'src/debug.ts',
                            'src/routes/+page.svelte',
                        ],
                    },
                },
            ],
        })
    } else if (workItem.type === 'continue-agent') {
        await sleep(500)
        signal.throwIfAborted()

        const numSteps = thread.steps.length
        if (numSteps === 3) {
            threadService.update(thread.id, {
                type: 'append-agent-steps',
                steps: [
                    {
                        id: newThreadStepID(),
                        type: 'agent-message',
                        content:
                            'OK, I read the existing files. I will now check if tests are already passing.',
                    },
                    {
                        id: newThreadStepID(),
                        type: 'tool',
                        tool: 'terminal-command',
                        args: {
                            cwd: '~/src/github.com/stellora/airline',
                            command: 'pnpm run test',
                        },
                    },
                ],
            })
        } else if (numSteps === 5) {
            threadService.update(thread.id, {
                type: 'append-agent-steps',
                steps: [
                    {
                        id: newThreadStepID(),
                        type: 'agent-message',
                        content: 'OK, the tests are passing. I will add a new test case.',
                    },
                    {
                        id: newThreadStepID(),
                        type: 'tool',
                        tool: 'edit-file',
                        args: {
                            file: 'flight_number_test.go',
                            diff: '@@ 123,456\n+ func TestParseFlightNumber(t *testing.T) {\n  ctx := context.Background()\n',
                        },
                    },
                    {
                        id: newThreadStepID(),
                        type: 'agent-message',
                        content: 'Let me run it to see if it works:',
                    },
                    {
                        id: newThreadStepID(),
                        type: 'tool',
                        tool: 'terminal-command',
                        args: {
                            cwd: '~/src/github.com/stellora/airline',
                            command: 'pnpm run test',
                        },
                    },
                ],
            })
        } else if (numSteps === 9) {
            threadService.update(thread.id, {
                type: 'append-agent-steps',
                steps: [
                    {
                        id: newThreadStepID(),
                        type: 'agent-message',
                        content: 'Great! The new unit test  passes.',
                    },
                    {
                        id: newThreadStepID(),
                        type: 'agent-turn-done',
                    },
                ],
            })
        }
    }
}

async function sleep(msec: number) {
    return new Promise(resolve => setTimeout(resolve, msec))
}
