import type { Observable } from 'observable-fns'
import { abortableOperation, distinctUntilChanged } from '../../misc/observable'
import {
    InteractiveThread,
    type InteractiveThreadService,
    type ThreadID,
    newThreadStepID,
} from './session'

export function createAgentForInteractiveThread(
    threadService: InteractiveThreadService,
    threadID: ThreadID
): Observable<AgentState> {
    const thread = threadService.observe(threadID, {})
    return thread.pipe(
        distinctUntilChanged(),
        abortableOperation((thread, signal) => handle(threadService, thread, signal))
    )
}

async function handle(
    threadService: InteractiveThreadService,
    thread: InteractiveThread,
    signal: AbortSignal
): Promise<void> {
    const lastStep = thread.steps.at(-1)
    const newHumanMessage = lastStep && lastStep.type === 'human-message' ? lastStep : null
    if (newHumanMessage) {
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
                    type: 'read-files',
                    files: [
                        'index.ts',
                        'package.json',
                        'src/main.ts',
                        'src/debug.ts',
                        'src/routes/+page.svelte',
                    ],
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
                    type: 'terminal-command',
                    cwd: '~/src/github.com/stellora/airline',
                    command: 'pnpm run test',
                    userChoice: 'pending',
                },
            ],
        })
    }
}

export type AgentState =
    | 'waiting-for-human-message'
    | 'waiting-for-human-choice'
    | 'waiting-for-tool-call'
    | 'working'

async function sleep(msec: number) {
    return new Promise(resolve => setTimeout(resolve, msec))
}
