import type Anthropic from '@anthropic-ai/sdk'
import type { CancellationToken } from 'vscode'
import type { Event } from './action'
import type { Environment } from './environment'

export interface BlockCheckpoint {
    blockid: string
    data: string
}

export interface Memory {
    getEvents: () => Event[]
    postEvent: (event: Event) => void
    setCheckpoint: (checkpoint: BlockCheckpoint | null) => void
    getCheckpoint(blockid: string): string | null
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

export class StateMachine {
    constructor(
        private cancellationToken: CancellationToken,
        private graph: {
            nodes: { [nodeid: string]: () => Block }
            edges: { [nodeid: string]: string | null }
        },
        private _currentNode: { nodeid: string; block: Block }
    ) {}

    public get currentNode(): { nodeid: string; block: Block } {
        return this._currentNode
    }

    public set currentNode(node: { nodeid: string; block: Block }) {
        this._currentNode = node
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
        await this._currentNode.block.do(this.cancellationToken, env, memory, anthropic)

        const nextNodeId = this.graph.edges[this._currentNode.nodeid]
        if (nextNodeId === null) {
            return true
        }
        if (nextNodeId === undefined) {
            throw new Error(`no next node defined for ${this._currentNode.nodeid}`)
        }

        this._currentNode = { nodeid: nextNodeId, block: this.createBlock(nextNodeId) }
        return false
    }
}
