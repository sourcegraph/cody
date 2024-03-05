import * as vscode from 'vscode'

import type { ChatEventSource, ContextItem, ContextMessage, EditModel } from '@sourcegraph/cody-shared'

import type { EditIntent, EditMode } from '../edit/types'

import { getOverridenModelForIntent } from '../edit/utils/edit-models'
import type { FixupFile } from './FixupFile'
import type { Diff } from './diff'
import { CodyTaskState } from './utils'

export type taskID = string

export class FixupTask {
    public id: taskID
    public state_: CodyTaskState = CodyTaskState.idle
    private stateChanges = new vscode.EventEmitter<CodyTaskState>()
    public onDidStateChange = this.stateChanges.event
    /**
     * The original text that we're working on updating. Set when we start an LLM spin.
     */
    public original = ''
    /**
     * The original range that we're working on updating.
     * Used to perform an accurate retry. We cannot use `selectionRange` as that range may expand with the replacement code.
     */
    public originalRange: vscode.Range
    /** The text of the streaming turn of the LLM, if any */
    public inProgressReplacement: string | undefined
    /** The text of the last completed turn of the LLM, if any */
    public replacement: string | undefined
    /** The error attached to the fixup, if any */
    public error: Error | undefined
    /**
     * If text has been received from the LLM and a diff has been computed,
     * it is cached here. Diffs are recomputed lazily and may be stale.
     */
    public diff: Diff | undefined
    /** The number of times we've submitted this to the LLM. */
    public spinCount = 0
    /**
     * A callback to skip formatting.
     * We use the users' default editor formatter so it is possible that
     * they may run into an error that we can't anticipate
     */
    public formattingResolver: ((value: boolean) => void) | null = null

    constructor(
        /**
         * The file that will be updated by Cody with the replacement text at the end of stream
         * This is set by the FixupController when creating the task,
         * and will be updated by the FixupController for tasks using the 'new' mode
         */
        public fixupFile: FixupFile,
        public readonly instruction: string,
        public readonly userContextFiles: ContextItem[],
        /* The intent of the edit, derived from the source of the command. */
        public readonly intent: EditIntent,
        public selectionRange: vscode.Range,
        /* The mode indicates how code should be inserted */
        public readonly mode: EditMode,
        public readonly model: EditModel,
        /* the source of the instruction, e.g. 'code-action', 'doc', etc */
        public source?: ChatEventSource,
        public readonly contextMessages?: ContextMessage[],
        /* The file to write the edit to. If not provided, the edit will be applied to the fixupFile. */
        public destinationFile?: vscode.Uri
    ) {
        this.id = Date.now().toString(36).replaceAll(/\d+/g, '')
        this.instruction = instruction.replace(/^\/(edit|fix)/, '').trim()
        this.originalRange = selectionRange
        this.model = getOverridenModelForIntent(this.intent, this.model)
    }

    /**
     * Sets the task state. Checks the state transition is valid.
     */
    public set state(state: CodyTaskState) {
        if (state === CodyTaskState.error) {
            console.log(new Error().stack)
        }
        this.state_ = state
        this.stateChanges.fire(state)
    }

    /**
     * Gets the state of the fixup task.
     *
     * @returns The current state of the fixup task.
     */
    public get state(): CodyTaskState {
        return this.state_
    }
}
