import { Observable } from 'observable-fns'

type Primitive = string | number | boolean | null
type Dict = Record<string, Primitive | readonly Primitive[] | Record<string, Primitive>>

export type ToolDefinition = {
    id: string
    argsFromModel: Dict
    argsFromUser?: Dict
    argsMeta?: Dict
    progress?: Dict
    result: Dict | undefined
    error?: ToolInvocationError
}

interface ToolInvocationError {
    message: string
}

export type ToolInvocation<ToolDef extends ToolDefinition = ToolDefinition> = {
    /**
     * Arguments to the tool, provided by the model.
     */
    args: {
        /**
         * Arguments to the tool that were provided by the model.
         */
        model: ToolDef['argsFromModel']

        /**
         * Arguments to the tool that were provided by the user.
         */
        user: ToolDef['argsFromUser']
    }

    /**
     * Information derived from the args, computed by the tool handler.
     *
     * Example: `diffStat` in the `edit-file` tool, which is derived from the args by parsing the
     * diff and computing the diff stat.
     */
    argsMeta: ToolDef['argsMeta']

    /**
     * The status and result of calling the tool.
     */
    invocation:
        | { status: 'blocked-on-user' }
        | { status: 'queued' }
        | {
              status: 'in-progress'
              progress: ToolDef['progress']
          }
        | {
              status: 'done'
              progress: ToolDef['progress']
              result: ToolDef['result']
          }
        | {
              // TODO!(sqs): differentiate between errors that should be fed back to the agent to
              // retry/continue vs. errors that indicate some bigger problem where the user needs to
              // intervene?
              status: 'error'
              progress: ToolDef['progress']
              error: ToolDef['error']
          }
}

export type ToolCallFunc<ToolDef extends ToolDefinition> = (
    args: ToolInvocation<ToolDef>['args']
) => Observable<ToolInvocation<ToolDef>['invocation']>

export interface ToolService {
    registerTool<ToolDef extends ToolDefinition>(
        id: ToolDef['id'],
        fn: ToolCallFunc<ToolDef>
    ): Disposable
    invokeTool<ToolDef extends ToolDefinition>(
        id: ToolDef['id'],
        args: ToolInvocation<ToolDef>['args']
    ): Observable<ToolInvocation<ToolDef>['invocation']>
}

export function createToolService(): ToolService {
    const tools = new Map<string /* tool ID */, ToolCallFunc<any>>()

    return {
        registerTool(id, fn) {
            if (tools.has(id)) {
                throw new Error(`tool ${JSON.stringify(id)} is already registered`)
            }
            tools.set(id, fn)
            return {
                [Symbol.dispose]: () => {
                    tools.delete(id)
                },
            }
        },
        invokeTool(id, args) {
            const fn = tools.get(id)
            if (!fn) {
                return new Observable(subscriber => {
                    subscriber.error(new Error(`tool ${JSON.stringify(id)} not found`))
                })
            }
            return fn(args)
        },
    }
}

export const toolService = createToolService()
