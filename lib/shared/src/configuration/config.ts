import * as gql from '../sourcegraph-api/graphql/dsl'
import {SourcegraphGraphQLAPIClient} from "../sourcegraph-api/graphql";
import {GraphQLAPIClientConfig} from "../sourcegraph-api/graphql/client";
import {logDebug} from '../logger'

export class AuthSwitcher {
    async signOut(endpoint: string): Promise<void> {
    }

    async signIn(apiClientConfig: GraphQLAPIClientConfig, abortSignal: AbortSignal): Promise<void> {
    }
}

export class AuthAndConfiguration {
    private abortController = new AbortController()

    get signal(): AbortSignal {
        return this.abortController.signal;
    }

    scopedCfg(): AuthAndConfiguration {
        throw new Error('NYI')
    }
}

export function newCfg<T>(fn: () => T): () => T {
    throw new Error('NYI')
}

// Example: Library without reactions. The caller is responsible for reacting to changes.
export function getPromptLibraryTags(): string[] {
    return getCfg().promptTags.filter(tag => !isExpletive(tag))
}

// Example: Svelte. Config is a fine-grained reactive object.
<script lang="ts">
import { config } from './mumble/config.svelte.ts'
import {Observable} from "observable-fns";
</script>
<TagPicker tags={config.promptTags} />

// Example: Imperative, async flow.
vscode.registerCommand('cody.thing', newCfg(async () => {
   const config = getCfg();
   if (!config.thing.isEnabled) {
       vscode.window.showInformationMessage('Insert money')
       return
   }
   config.scoped(() => {
       const quickpick = vscode.window.createQuickPick(getCfg().models.map(makeModelItem))
       const dispose = getCfg().onChange(() => {
          quickpick.items = getCfg().models.map(makeModelItem)
       })
       quickpick.show()
       quickpick.onDidAccept(() => {
           dispose()
       })
   })
   // Or
   const model = await vscode.window.showQuickPick(config.models.map(...))
   return config.use(() => {
       // We wrap fetch in many layers, but you get the idea...
       fetch(getCfg().endpoint + '/.api/foo', { signal: getCfg().signal, headers: { 'X-Use-Model': model } })
   })
}))

// Example: I love Observables.
export function getModelListObservable(): Observable<readonly Model[]> {
    return getCfg().scoped(() => {
        const subject = new Subject<readonly Model[]>(getCfg().models)
        // Note, we can't dispose this.
        getCfg().onChange(() => {
            subject.next(getCfg().models)
        })
        return Observable.from(subject)
    })
}

// TODO:
// - Enlist the current "thread" in the configuration values it is reading.
// - Validate the read configuration when it is used.

const stack: AuthAndConfiguration[] = []

/// Gets the active configuration for the current task.
export function getCfg(): AuthAndConfiguration {
    const config = stack.at(-1);
    if (!config) {
        throw new Error('getConfig without an active context')
    }
    return config;
}

/// Establishes `config` as the configuration for executing `fn`.
export function usingCfg<T>(config: AuthAndConfiguration, fn: () => T) {
    stack.push(config)
    try {
        return fn()
    } finally {
        if (stack.pop() !== config) {
            throw new Error('usingConfig tried to pop a corrupt context stack')
        }
    }
}

/// Passes the current task's configuration to `fn`. Use this to tie async callbacks into the same
/// configuration as the current task.
export function passCfg<T>(fn: () => Promise<T>): () => Promise<T> {
    const config = getCfg();
    return () => {
        stack.push(config)
        try {
            return fn()
        } finally {
            if (stack.pop() !== config) {
                throw new Error('withActiveContext tried to pop a corrupt context stack')
            }
        }
    }
}

const queryPieces = {
    codeSearchEnabled: gql.labeled('codeSearchEnabled', gql.args(gql.q.boolean('enterpriseLicenseHasFeature'), gql.constant('feature', 'code-search'))),
    siteProductVersion: gql.nested('site', gql.q.string('version')),
    // TODO: For fields added in such-and-such a version, let's add a combinator for filtering by version.
    viewerSettings: gql.nested('viewerSettings', gql.q.string('final')),
}

// This is a stub for developing the config fetcher.
export async function TODOstub(apiClientConfig: GraphQLAPIClientConfig): Promise<void> {
    const abortController = new AbortController()
    const fetcher = new ConfigFetcher()
    fetcher.fetch(abortController.signal, apiClientConfig).then(console.log)
}

/// Authenticates with a Sourcegraph instance and retrieves product configuration.
/// Fetches the whole product configuration.
class ConfigFetcher {
    async fetch(abortSignal: AbortSignal, apiClientConfig: GraphQLAPIClientConfig): Promise<void> {
        try {
            const client = SourcegraphGraphQLAPIClient.withStaticConfig(apiClientConfig)

            // Make the initial query to establish the site version.
            const q1 = gql.prepare('0.0.0', queryPieces.siteProductVersion)
            const q1Result = await client.fetchSourcegraphAPI<gql.Realize<typeof q1.query>>(q1.text!, {}, abortSignal)
            if (q1Result instanceof Error) {
                throw q1Result
            }
            const version = q1Result.site.version


            const configQuery = gql.prepare(version, queryPieces.codeSearchEnabled, queryPieces.viewerSettings)
            logDebug('XXXDPC', configQuery.text!)
            const config1 = await client.fetchSourcegraphAPI<gql.Realize<typeof configQuery.query>>(configQuery.text!, {}, abortSignal)
            if (config1 instanceof Error) {
                throw config1
            }
            // TODO, see lib/shared/src/sourcegraph-api/clientConfig.ts for viewerConfig handling
            // Note, viewerConfig used to be permissive about errors, it was probably added in some Sourcegraph version.
            logDebug('XXXDPC', JSON.stringify(config1))
        } catch (e: any) {
            logDebug('XXXDPC', e.toString())
        }
    }
}
