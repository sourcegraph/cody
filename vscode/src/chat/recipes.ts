import { ContextSearch } from '@sourcegraph/cody-shared/src/chat/recipes/context-search'
import { ExplainCodeDetailed } from '@sourcegraph/cody-shared/src/chat/recipes/explain-code-detailed'
import { ExplainCodeHighLevel } from '@sourcegraph/cody-shared/src/chat/recipes/explain-code-high-level'
import { FindCodeSmells } from '@sourcegraph/cody-shared/src/chat/recipes/find-code-smells'
import { Fixup } from '@sourcegraph/cody-shared/src/chat/recipes/fixup'
import { GenerateDocstring } from '@sourcegraph/cody-shared/src/chat/recipes/generate-docstring'
import { PrDescription } from '@sourcegraph/cody-shared/src/chat/recipes/generate-pr-description'
import { ReleaseNotes } from '@sourcegraph/cody-shared/src/chat/recipes/generate-release-notes'
import { GenerateTest } from '@sourcegraph/cody-shared/src/chat/recipes/generate-test'
import { GitHistory } from '@sourcegraph/cody-shared/src/chat/recipes/git-log'
import { ImproveVariableNames } from '@sourcegraph/cody-shared/src/chat/recipes/improve-variable-names'
import { InlineChat } from '@sourcegraph/cody-shared/src/chat/recipes/inline-chat'
import { InlineTouch } from '@sourcegraph/cody-shared/src/chat/recipes/inline-touch'
import { MyPrompt } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'
import { NextQuestions } from '@sourcegraph/cody-shared/src/chat/recipes/next-questions'
import { NonStop } from '@sourcegraph/cody-shared/src/chat/recipes/non-stop'
import { Recipe, RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { TranslateToLanguage } from '@sourcegraph/cody-shared/src/chat/recipes/translate'

import { debug } from '../log'
import { getChatPreamble, getEditPreamble } from '../preamble'

const registeredRecipes: { [id in RecipeID]?: Recipe } = {}

export function getRecipe(id: RecipeID): Recipe | undefined {
    return registeredRecipes[id]
}

function registerRecipe(id: RecipeID, recipe: Recipe): void {
    registeredRecipes[id] = recipe
}

function init(): void {
    if (Object.keys(registeredRecipes).length > 0) {
        return
    }

    const fixup = new Fixup(getEditPreamble)

    const recipes: Recipe[] = [
        // new ChatQuestion(debug),
        new ContextSearch(getChatPreamble),
        new ExplainCodeDetailed(getChatPreamble),
        new ExplainCodeHighLevel(getChatPreamble),
        new FindCodeSmells(getChatPreamble),
        new Fixup(getChatPreamble),
        new GenerateDocstring(getEditPreamble),
        new GenerateTest(getEditPreamble),
        new GitHistory(getChatPreamble),
        new ImproveVariableNames(getEditPreamble),
        new MyPrompt(getChatPreamble),
        new InlineChat(debug),
        new InlineTouch(debug),
        new NextQuestions(getChatPreamble),
        new NonStop(getEditPreamble),
        new ReleaseNotes(getChatPreamble),
        new PrDescription(getChatPreamble),
        new TranslateToLanguage(getChatPreamble),
    ]

    for (const recipe of recipes) {
        const existingRecipe = getRecipe(recipe.id)
        if (existingRecipe) {
            throw new Error(`Duplicate recipe with ID ${recipe.id}`)
        }
        registerRecipe(recipe.id, recipe)
    }
}

init()
