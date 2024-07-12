import type Anthropic from '@anthropic-ai/sdk'
import type { CancellationToken } from 'vscode'
import type { Event } from './action'
import type { Environment } from './environment'

export interface Memory {
    getEvents: () => Event[]
    postEvent: (event: Event) => void
}

export interface BlockResult {
    status: 'done' | 'cancelled'
    error?: string
}

/**
 * A composable block of execution.
 */
export interface Block {
    id: string
    do: (
        cancellationToken: CancellationToken,
        env: Environment,
        memory: Memory,
        anthropic: Anthropic
    ) => Promise<BlockResult>
}

/**
 * A state machine is composed of nodes and edges. The nodes identify
 * constructors of execution blocks. The state machine then executes
 * these blocks.
 */
export class StateMachine {
    constructor(
        private cancellationToken: CancellationToken,
        private graph: {
            nodes: { [nodeid: string]: () => Block }
            edges: { [nodeid: string]: string | null }
        },
        private _currentBlock: { nodeid: string; block: Block }
    ) {}

    public get currentBlock(): { nodeid: string; block: Block } {
        return this._currentBlock
    }

    public set currentBlock(node: { nodeid: string; block: Block }) {
        this._currentBlock = node
    }

    public createBlock(nodeid: string): Block {
        const blockCtr = this.graph.nodes[nodeid]
        if (!blockCtr) {
            throw new Error(`no node constructor defined for ${nodeid}`)
        }
        return blockCtr()
    }

    /**
     * @returns true if done, false otherwise
     */
    public async step(env: Environment, memory: Memory, anthropic: Anthropic): Promise<boolean> {
        await this._currentBlock.block.do(this.cancellationToken, env, memory, anthropic)

        const nextNodeId = this.graph.edges[this._currentBlock.nodeid]
        if (nextNodeId === null) {
            return true
        }
        if (nextNodeId === undefined) {
            throw new Error(`no next node defined for ${this._currentBlock.nodeid}`)
        }

        this._currentBlock = { nodeid: nextNodeId, block: this.createBlock(nextNodeId) }
        return false
    }
}
