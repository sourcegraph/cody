import { type UseObservableResult, useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * React hook to check if Cody is enabled at the site level.
 */
export function useSiteHasCodyEnabled(): UseObservableResult<boolean | Error> {
    const getSiteHasCodyEnabled = useExtensionAPI().getSiteHasCodyEnabled
    return useObservable(useMemo(() => getSiteHasCodyEnabled(), [getSiteHasCodyEnabled]))
}
