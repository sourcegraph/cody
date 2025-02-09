import { Observable } from 'observable-fns'
import { observableOfTimedSequence } from '../../misc/observable'
import type { ToolCallFunc, ToolDefinition, ToolService } from './tool-service'

type CheckToolDefinition<ToolDef extends ToolDefinition> = ToolDef

export type BuiltinTools = {
    'read-files': CheckToolDefinition<{
        id: 'read-files'
        args: { files: string[] }
        result: { [file: string]: string }
    }>
    'create-file': CheckToolDefinition<{
        id: 'create-file'
        args: { file: string; content: string }
        result: undefined
    }>
    'edit-file': CheckToolDefinition<{
        id: 'edit-file'
        args: { file: string; diff: string }
        meta: { diffStat: { added: number; changed: number; deleted: number } }
        progress: { [doneApplyingToFile: string]: boolean }
        result: undefined
    }>
    'terminal-command': CheckToolDefinition<{
        id: 'terminal-command'
        args: { cwd?: string; command: string }
        progress: { output: string }
        result: { output: string; exitCode: number }
    }>
    definition: CheckToolDefinition<{
        id: 'definition'
        args: { symbol: string }
        result: { content: string }
    }>
    references: CheckToolDefinition<{
        id: 'references'
        args: { symbol: string }
        result: { references: string[]; repositories: string[] }
    }>
}

let registered = false

export function registerBuiltinTools(toolService: ToolService): Disposable {
    if (registered) {
        return { [Symbol.dispose]: () => {} }
    }
    registered = true

    const disposables: Disposable[] = [
        toolService.registerTool<BuiltinTools['read-files']>('read-files', readFilesTool),
        toolService.registerTool<BuiltinTools['terminal-command']>(
            'terminal-command',
            terminalCommandTool
        ),
    ]
    return {
        [Symbol.dispose]: () => {
            for (const d of disposables) {
                d[Symbol.dispose]()
            }
        },
    }
}

const readFilesTool: ToolCallFunc<BuiltinTools['read-files']> = ({ args }) => {
    return observableOfTimedSequence(250, {
        status: 'done',
        progress: {},
        result: Object.fromEntries(
            args.files.map(file => [file, `TODO!(sqs): file contents for \`${file}\``])
        ),
    })
}

const terminalCommandTool: ToolCallFunc<BuiltinTools['terminal-command']> = ({ args, userInput }) => {
    // For security, require explicit user approval before running terminal commands.
    if (!userInput?.accepted) {
        return Observable.of({ status: 'blocked-on-user' })
    }
    return observableOfTimedSequence(
        100,
        {
            status: 'in-progress',
            progress: { output: 'Running tests...' },
        },
        750,
        {
            status: 'done',
            progress: { output: 'Running tests...' },
            result: { output: 'tests passed', exitCode: 0 },
        }
    )
}
