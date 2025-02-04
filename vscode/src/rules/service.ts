import {
    type RuleService,
    clientCapabilities,
    createRuleService,
    defer,
    isDefined,
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
            return {
                languages: [], // TODO!(sqs): fill in languages
                path: file.path,
                repo: 'github.com/sourcegraph/review-agent-sandbox', // TODO!(sqs): fill in repo, use this instead of RepoNameResolver
                textContent: '', // TODO(sqs): fill in text content
            }
        },
    }
)
