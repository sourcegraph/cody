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
    })
})
