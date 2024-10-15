/**
 * In node environments, it might be necessary to set up a custom agent to
 * control the network requests being made.
 *
 * To do this, we have a mutable agent variable that can be set externally. For
 * this to work we need to ensure no other dependencies have loaded yet. That's
 * why this module is seperate from the fetch.ts file which simply re-exports
 * this variable. This way the patching code can simply import this specific
 * file and gain early access to the agentRef
 *
 * 🚨 Do not import this file unless you're specifically patching the variable.
 * For read-only access simply import the fetch.ts file
 */

import type EventEmitter from 'node:events'
import type * as http from 'node:http'
import type * as https from 'node:https'
import type { Agent } from 'agent-base'

let _globalAgent: Agent | undefined
let _eventEmitter: EventEmitter<NetEventMap> | undefined
let _blockEarlyAccess = false
export const globalAgentRef = {
    get agent() {
        if (_blockEarlyAccess && !_globalAgent) {
            throw new Error('Agent was used before it was initialized')
        }
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

    set blockEarlyAccess(v: boolean) {
        _blockEarlyAccess = v
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
