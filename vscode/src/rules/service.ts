import {
    type RuleService,
    clientCapabilities,
    createRuleService,
    defer,
    isDefined,
    languageFromFilename,
} from '@sourcegraph/cody-shared'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared'
import { switchMap } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { createFileSystemRuleProvider } from './fs-rule-provider'
import { createRemoteRuleProvider } from './remote-rule-provider'

/**
 * The global singleton {@link RuleService}.
 */
export const ruleService: RuleService = createRuleService(
    defer(() =>
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.NextAgenticChatInternal).pipe(
            switchMap(isAgenticChatInternalTester => {
                // Return empty array if the feature flag is on
                if (isAgenticChatInternalTester !== false) {
                    return Observable.of([])
                }

                return Observable.of(
                    [
                        clientCapabilities().isVSCode
                            ? createFileSystemRuleProvider()
                            : createRemoteRuleProvider(),
                    ].filter(isDefined)
                )
            })
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
