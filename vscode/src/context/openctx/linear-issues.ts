import linearIssues from '@openctx/provider-linear-issues'
import type { InternalOpenCtxProvider } from '@sourcegraph/cody-shared'

const LinearIssuesProvider: InternalOpenCtxProvider = {
    providerUri: 'internal-linear-issues',
    ...linearIssues,
}

export default LinearIssuesProvider
