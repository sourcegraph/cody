import { RateLimitError } from '../errors'
import { graphqlClient } from '../graphql'

export function convertCodyGatewayErrorToRateLimitError(error: string, feature: string): Promise<RateLimitError> {
    return new Promise(resolve => {
        const limit = /exceeded the rate limit of (\d+) requests/.exec(error)
        const retryAfter = /Retry after (.*)\n/.exec(error)

        graphqlClient
            .getCurrentUserCodyProEnabled()
            .then(user => {
                if (!('codyProEnabled' in user)) {
                    throw user
                }
                const rateLimitError = new RateLimitError(
                    feature,
                    error,
                    !user.codyProEnabled,
                    limit ? parseInt(limit[0], 10) : undefined,
                    retryAfter ? retryAfter[0] : undefined
                )
                resolve(rateLimitError)
            })
            .catch(() => {
                const rateLimitError = new RateLimitError(
                    feature,
                    error,
                    true,
                    limit ? parseInt(limit[0], 10) : undefined,
                    retryAfter ? retryAfter[0] : undefined
                )
                resolve(rateLimitError)
            })
    })
}
