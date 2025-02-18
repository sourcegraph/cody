import {
    type RuleService,
    clientCapabilities,
    createRuleService,
    defer,
    isDefined,
    languageFromFilename,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { createFileSystemRuleProvider } from './fs-rule-provider'
import { createRemoteRuleProvider } from './remote-rule-provider'

/**
 * The global singleton {@link RuleService}.
 */
export const ruleService: RuleService = createRuleService(
    defer(() =>
        Observable.of(
            [
                clientCapabilities().isVSCode
                    ? createFileSystemRuleProvider()
                    : createRemoteRuleProvider(),
            ].filter(isDefined)
        )
    ),
    {
        fileInfo: file => {
            // TODO(sqs): align language IDs with what the backend uses
            const lang = languageFromFilename(file)
            return {
                languages: [lang],
                path: file.path,
                repo: '', // TODO(sqs): fill in repo
                textContent: '', // TODO(sqs): fill in text content
            }
        },
    }
)
