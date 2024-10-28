/**
 * In node environments, it might be necessary to set up a custom agent to
 * control the network requests being made.
 *
 * To do this, we expose the globalAgentRef variable that can be mutated
 * externally.
 *
 * 🚨 Do not import this file unless you're specifically patching the variable.
 * For read-only access simply import the fetch.ts file. This variable was only
 * isolated into this separate .patch file so that patching code can import this
 * without bringing in transitive dependencies.
 *
 * An example of such a patch where this is critical is in `vscode/src/net/net.patch.ts`
 */

import type EventEmitter from 'node:events'
import type * as http from 'node:http'
import type * as https from 'node:https'
import type { Agent } from 'agent-base'

let _globalAgent: Agent | undefined
let _eventEmitter: EventEmitter<NetEventMap> | undefined
export const globalAgentRef = {
    get agent() {
        return _globalAgent
    },

    get netEvents() {
        return _eventEmitter
    },

    set agent(v: Agent | undefined) {
        //TODO: Maybe we only want to allow this once!
        _globalAgent = v
    },

    set netEvents(v: EventEmitter<NetEventMap> | undefined) {
        _eventEmitter = v
    },

    get isSet() {
        return _globalAgent !== undefined
    },
}

interface RequestEvent {
    req: http.ClientRequest
    protocol: 'http' | 'https'
    url?: string | URL
    options?: http.RequestOptions | https.RequestOptions
    agent: 'vscode' | 'delegating-agent' | 'other' | null
}
export type NetEventMap = {
    request: [RequestEvent]
}
