import linearIssues from '@openctx/provider-linear-issues'
import type { OpenCtxProvider } from './types'

const LinearIssuesProvider: OpenCtxProvider = {
    providerUri: 'internal-linear-issues',
    ...linearIssues,
}

export default LinearIssuesProvider
