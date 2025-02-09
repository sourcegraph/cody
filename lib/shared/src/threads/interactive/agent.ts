import { Observable } from 'observable-fns'
import {
    distinctUntilChanged,
    mergeMap,
    promiseFactoryToObservable,
    startWith,
} from '../../misc/observable'
import { registerBuiltinTools } from './builtin-tools'
import type { InteractiveThreadService } from './session'
import { type InteractiveThread, type ThreadID, type ThreadStep, newThreadStepID } from './thread'
import { toolService } from './tool-service'

export function createAgentForInteractiveThread(
    threadService: InteractiveThreadService,
    threadID: ThreadID
): Observable<AgentState> {
    registerBuiltinTools(toolService)

    const thread = threadService.observe(threadID, {})
    return thread.pipe(
        distinctUntilChanged(),
        mergeMap(thread => {
            const workItem = workItemFromThread(thread)
            const agentState = agentStateFromThread(thread)
            if (workItem) {
                // Run async and do not await.
                //
                // TODO!(sqs): error handling
                return promiseFactoryToObservable(signal =>
                    handle(threadService, thread, workItem, signal)
                ).pipe(startWith(agentState))
            }

            return Observable.of(agentState)
        })
    )
}

type AgentWorkItem =
    | { type: 'new-human-message'; step: Extract<ThreadStep, { type: 'human-message' }> }
    | { type: 'call-tool'; step: ThreadStep }

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
        return { type: 'call-tool', step: lastStep }
    }

    return null
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
            ([step, { invocation }]) => invocation.status === 'blocked-on-user'
        )
    if (blockedInvocation) {
        return 'blocked-on-user-input-for-tool-call'
    }

    // Check if any tools are running.
    const inProgressInvocation =
        thread.toolInvocations &&
        Object.entries(thread.toolInvocations).find(
            ([step, { invocation }]) => invocation.status === 'in-progress'
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

        await sleep(500)
        signal.throwIfAborted()

        threadService.update(thread.id, {
            type: 'set-step-results',
            step: workItem.step.id,
            mergeDataTODO: { output: 'Hello, world - tests passed', pending: false },
        })
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
            ],
        })

        await sleep(500)
        signal.throwIfAborted()
        threadService.update(thread.id, {
            type: 'append-agent-steps',
            steps: [
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

        await sleep(700)
        signal.throwIfAborted()
        threadService.update(thread.id, {
            type: 'append-agent-steps',
            steps: [
                {
                    id: newThreadStepID(),
                    type: 'agent-message',
                    content: 'I will check if tests are already passing.',
                },
            ],
        })

        await sleep(250)
        signal.throwIfAborted()
        threadService.update(thread.id, {
            type: 'append-agent-steps',
            steps: [
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
    }
}

async function sleep(msec: number) {
    return new Promise(resolve => setTimeout(resolve, msec))
}
