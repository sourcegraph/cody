import { describe, expect, it } from 'vitest'
import { ClientErrorsTransformer } from './clientErrors'

describe('ClientErrorsTransformer', () => {
    it('transforms errors correctly with no transformers', () => {
        const error = 'Test error'
        expect(ClientErrorsTransformer.transform(error)).toBe(error)
    })

    it('adds trace ID when provided', () => {
        const error = 'Test error'
        const traceId = 'test-trace-id'

        expect(ClientErrorsTransformer.transform(error, traceId)).toContain(traceId)
    })

    describe('specific error transformations', () => {
        it('transforms gateway error with content missing', () => {
            const errorMessage = `'Sourcegraph Cody Gateway: unexpected status code 400: {
                "error": {
                    "code": 400,
                    "message": "* GenerateContentRequest.contents: contents is not specified\\n",
                    "status": "INVALID_ARGUMENT"
                }
            }`

            const simplifiedErrorMessage =
                '* GenerateContentRequest.contents: contents is not specified\\n'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms error with empty messages array', () => {
            const errorMessage = `Sourcegraph Cody Gateway: unexpected status code 400: {
              "error": {
                "message": "Invalid 'messages': empty array. Expected an array with minimum length 1, but got an empty array instead.",
                "type": "invalid_request_error",
                "param": "messages",
                "code": "empty_array"
              }
            }`

            const simplifiedErrorMessage =
                "Invalid 'messages': empty array. Expected an array with minimum length 1, but got an empty array instead."
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms error with 400 bad request config error', () => {
            const errorMessage = `Sourcegraph Cody Gateway: unexpected status code 400: {
                "error": {
                    "message": "Invalid 'config': invalid value. Expected a valid JSON object, but got an invalid value instead.",
                    "type": "invalid_request_error",
                    "param": "config",
                    "code": "invalid_value"
                }
            }`
            const simplifiedErrorMessage =
                "Invalid 'config': invalid value. Expected a valid JSON object, but got an invalid value instead."
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms context deadline exceeded error', () => {
            const errorMessage = 'Something went wrong: context deadline exceeded'
            const simplifiedErrorMessage =
                'Context deadline exceeded. Please try again with a smaller context.'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms network error', () => {
            const errorMessage =
                'Request to https://sourcegraph.com failed with 406 Not Acceptable: ' +
                'Unsupported API Version (Please update your client'
            const simplifiedErrorMessage =
                '406 Not Acceptable: Unsupported API Version (Please update your client'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms AUP error simple', () => {
            const errorMessage = 'Error with "AUP" "message" "Inappropriate content detected"'
            const simplifiedErrorMessage = 'Inappropriate content detected'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms AUP error OpenAI', () => {
            const errorMessage =
                'OpenAI (Sourcegraph Cody Gateway): unexpected status code 400: {"error":' +
                '"We blocked your request because we detected your prompt to be against our ' +
                'Acceptable Use Policy (https://sourcegraph.com/terms/aup). Try again by ' +
                'removing any phrases that may violate our AUP. If you think this is a ' +
                'mistake, please contact support@sourcegraph.com and reference this ID: ' +
                'b6a46f9fe91c006a07d138c0da14b0e7"}'
            const simplifiedErrorMessage =
                'We blocked your request because we detected your prompt to be against our ' +
                'Acceptable Use Policy (https://sourcegraph.com/terms/aup). Try again by ' +
                'removing any phrases that may violate our AUP. If you think this is a ' +
                'mistake, please contact support@sourcegraph.com and reference this ID: ' +
                'b6a46f9fe91c006a07d138c0da14b0e7'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms 400 unexpected 429', () => {
            const errorMessage =
                'Request to https://sourcegraph.com/.api/completions/stream?api-version=2&client-name=vscode&client-version=1.70.2 ' +
                'failed with 400 Bad Request: status 400, reason fetching subscription from SSC: unexpected status code 429'
            const simplifiedErrorMessage =
                '400 Bad Request: status 400, reason fetching subscription from SSC: unexpected status code 429'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })
        it('transforms ES rate limit', () => {
            const errorMessage =
                'Sourcegraph Cody Gateway: unexpected status code 429: you have exceeded the rate limit of 150 requests. Retry after 2025-02-16 03:04:52 +0000 UTC'
            const simplifiedErrorMessage =
                'You have exceeded the rate limit of 150 requests. Retry after Sun, 16 Feb 2025 03:04:52 GMT'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms 400 fetching subscription error', () => {
            const errorMessage = `Request to https://sourcegraph.com/.api/completions/stream?api-
                version=28client-name=jetbrains&client-version=7.66.0 failed with
                400 Bad Request: status 400, reason fetching subscription from SSC:
                calling SSC: Get
                "https://accounts.sourcegraph.com/cody/api/rest/svc/subscription/019
                4c3b6-6f79-74c8-960d-e4e738cf96cb": http2: server sent GOAWAY and
                closed the connection; LastStreamID= 1497,
                ErrCode=ENHANCE_YOUR_CALM, debug=`
            const simplifiedErrorMessage = 'Error fetching subscription. Please try again later.'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms 400 non-empty content', () => {
            const errorMessage = `Stream processing failed: Error: 400 {"type":"error", "error": 
            ("type" "invalid_request_error" "message": "messages.0: all messages must have non-empty content except for the optional final assistant message")}`
            const simplifiedErrorMessage =
                'messages.0: all messages must have non-empty content except for the optional final assistant message'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })

        it('transforms another specific error case', () => {
            const errorMessage = `Request Failed: Sourcegraph Cody
                Gateway: unexpected status code
                503: ("type":"error", "error":
                {"type": "rate_limit_error","message":"
                This request would exceed your organization's rate limit of 1,000,000 input tokens per minute. For details, refer to:
                https://docs.anthropic.com/en/api/r
                ate-limits; see the response headers for current usage. Please reduce the prompt length or the maximum tokens requested, or try again later.
                You may also contact sales at https://www.anthropic.com/contact-
                sales to discuss your options for a rate limit increase."})`
            const simplifiedErrorMessage = 'Upstream service error.'
            expect(ClientErrorsTransformer.transform(errorMessage)).toContain(simplifiedErrorMessage)
        })
    })
})
