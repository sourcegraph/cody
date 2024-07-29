import { type Prompt, createExtensionAPIProxyInWebview } from '@sourcegraph/cody-shared'
import {
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'
import type { ExtensionMessage, WebviewMessage } from '../../../src/chat/protocol'
import type { VSCodeWrapper } from '../../utils/VSCodeApi'

type RequestParams = Omit<Extract<WebviewMessage, { command: 'queryPrompts' }>, 'command'>
type ResponseValue = Omit<Extract<ExtensionMessage, { type: 'queryPrompts/response' }>, 'type'>

export interface PromptsClient {
    queryPrompts(params: RequestParams): Promise<ResponseValue>
}

const PromptsClientContext = createContext<PromptsClient | undefined>(undefined)

export const PromptsClientProviderFromVSCodeAPI: FunctionComponent<{
    vscodeAPI: VSCodeWrapper | null
    children: ReactNode
}> = ({ vscodeAPI, children }) => {
    const value = useMemo<PromptsClient | null>(
        () =>
            vscodeAPI
                ? {
                      queryPrompts: createExtensionAPIProxyInWebview(
                          vscodeAPI,
                          'queryPrompts',
                          'queryPrompts/response'
                      ),
                  }
                : null,
        [vscodeAPI]
    )
    return value ? (
        <PromptsClientContext.Provider value={value}>{children}</PromptsClientContext.Provider>
    ) : (
        <>{children}</>
    )
}

/**
 * @internal Used in tests only.
 */
export const PromptsClientProviderForTestsOnly = PromptsClientContext.Provider

type UsePromptsQueryResult =
    | { data: Prompt[]; loading: false; error: null }
    | { data: undefined; loading: true; error: null }
    | { data: undefined; loading: false; error: Error }

/**
 * React hook to query for prompts in the prompt library.
 */
export function usePromptsQuery(query: string): UsePromptsQueryResult {
    const client = useContext(PromptsClientContext)
    if (!client) {
        throw new Error(
            'usePromptsQuery must be used within a PromptsClientProviderFromVSCodeAPI or PromptsClientProviderForTestsOnly'
        )
    }

    const [result, setResult] = useState<UsePromptsQueryResult>({
        data: undefined,
        loading: true,
        error: null,
    })

    useEffect(() => {
        setResult({ data: undefined, loading: true, error: null })

        // Track if the query changed since this request was sent (which would make our results
        // no longer valid).
        let invalidated = false

        client
            .queryPrompts({ query })
            .then(({ result, error }) => {
                if (invalidated) {
                    return
                }
                setResult(
                    result
                        ? { data: result, loading: false, error: null }
                        : { data: undefined, loading: false, error: new Error(error!) }
                )
            })
            .catch(error => {
                if (invalidated) {
                    return
                }
                setResult({ data: undefined, loading: false, error })
            })

        return () => {
            invalidated = true
        }
    }, [client, query])

    return useMemo(() => result, [result])
}
