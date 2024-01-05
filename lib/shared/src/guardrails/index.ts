import { pluralize } from '../common'
import { isError } from '../utils'

export interface Attribution {
    limitHit: boolean
    repositories: RepositoryAttribution[]
}

export interface RepositoryAttribution {
    name: string
}

export interface Guardrails {
    searchAttribution(snippet: string): Promise<Attribution | Error>
}

export function summariseAttribution(attribution: Attribution | Error): string {
    if (isError(attribution)) {
        return `guardrails attribution search failed: ${attribution.message}`
    }

    const repos = attribution.repositories
    const count = repos.length
    if (count === 0) {
        return 'no matching repositories found'
    }

    const summary = repos.slice(0, count < 5 ? count : 5).map(repo => repo.name)
    if (count > 5) {
        summary.push('...')
    }

    return `found ${count}${attribution.limitHit ? '+' : ''} matching ${pluralize(
        'repository',
        count,
        'repositories'
    )} ${summary.join(', ')}`
}
