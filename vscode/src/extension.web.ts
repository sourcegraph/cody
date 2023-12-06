import * as vscode from 'vscode'

import { ChatQuestion } from '@sourcegraph/cody-shared/src/chat/recipes/chat-question'
import { ContextSearch } from '@sourcegraph/cody-shared/src/chat/recipes/context-search'
import { CustomPrompt } from '@sourcegraph/cody-shared/src/chat/recipes/custom-prompt'
import { ExplainCodeDetailed } from '@sourcegraph/cody-shared/src/chat/recipes/explain-code-detailed'
import { ExplainCodeHighLevel } from '@sourcegraph/cody-shared/src/chat/recipes/explain-code-high-level'
import { FindCodeSmells } from '@sourcegraph/cody-shared/src/chat/recipes/find-code-smells'
import { Fixup } from '@sourcegraph/cody-shared/src/chat/recipes/fixup'
import { GenerateDocstring } from '@sourcegraph/cody-shared/src/chat/recipes/generate-docstring'
import { GenerateTest } from '@sourcegraph/cody-shared/src/chat/recipes/generate-test'
import { ImproveVariableNames } from '@sourcegraph/cody-shared/src/chat/recipes/improve-variable-names'
import { NextQuestions } from '@sourcegraph/cody-shared/src/chat/recipes/next-questions'
import { Recipe } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { TranslateToLanguage } from '@sourcegraph/cody-shared/src/chat/recipes/translate'
import { SourcegraphBrowserCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/browserClient'

import { ExtensionApi } from './extension-api'
import { activate as activateCommon } from './extension.common'
import { logDebug } from './log'
import { WebSentryService } from './services/sentry/sentry.web'

/**
 * Recipes that can run in VS Code Web (and do not rely on Node packages such as `child_process`).
 */
export const VSCODE_WEB_RECIPES: Recipe[] = [
    new ChatQuestion(logDebug),
    new ExplainCodeDetailed(),
    new ExplainCodeHighLevel(),
    new FindCodeSmells(),
    new Fixup(),
    new GenerateDocstring(),
    new GenerateTest(),
    new ImproveVariableNames(),
    new CustomPrompt(),
    new NextQuestions(),
    new TranslateToLanguage(),
    new ContextSearch(),
]

/**
 * Activation entrypoint for the VS Code extension when running in VS Code Web (https://vscode.dev,
 * https://github.dev, etc.).
 */
export function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
    return activateCommon(context, {
        createCompletionsClient: (...args) => new SourcegraphBrowserCompletionsClient(...args),
        createSentryService: (...args) => new WebSentryService(...args),
        recipes: VSCODE_WEB_RECIPES,
    })
}
