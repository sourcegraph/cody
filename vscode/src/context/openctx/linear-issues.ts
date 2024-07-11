import linearIssues from '@openctx/provider-linear-issues'
import type { OpenContextProvider } from './types'

const LinearIssuesProvider: OpenContextProvider = {
    providerUri: 'internal-linear-issues',
    ...linearIssues,
}

export default LinearIssuesProvider
