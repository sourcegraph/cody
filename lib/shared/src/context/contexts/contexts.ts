/**
 * Pinnable, saved contexts. You can define a context on Sourcegraph, which is basically a reusable
 * snippet of text and some @-mentions that you can prepend to your chat message.
 */
export interface Context {
    id: string
    name: string
    description?: string
    spec: string
    query: string
    default: boolean
    starred: boolean
}
