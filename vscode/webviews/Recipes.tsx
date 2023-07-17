import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

import { isInternalUser } from '../src/chat/protocol'

import { VSCodeWrapper } from './utils/VSCodeApi'

import styles from './Recipes.module.css'

export const recipesList = {
    'explain-code-detailed': 'Explain selected code (detailed)',
    'explain-code-high-level': 'Explain selected code (high level)',
    'generate-unit-test': 'Generate a unit test',
    'generate-docstring': 'Generate a docstring',
    'improve-variable-names': 'Improve variable names',
    'translate-to-language': 'Translate to different language',
    'git-history': 'Summarize recent code changes',
    'find-code-smells': 'Smell code',
    fixup: 'Fixup code from inline instructions',
    'context-search': 'Codebase context search',
    'release-notes': 'Generate release notes',
    'pr-description': 'Generate pull request description',
}

export const Recipes: React.FunctionComponent<{
    vscodeAPI: VSCodeWrapper
    myPrompts: string[]
    endpoint: string
}> = ({ vscodeAPI, myPrompts, endpoint }) => {
    const onRecipeClick = (recipeID: RecipeID): void => {
        vscodeAPI.postMessage({ command: 'executeRecipe', recipe: recipeID })
    }
    const onMyPromptClick = (promptID: string): void => {
        vscodeAPI.postMessage({ command: 'my-prompt', title: promptID })
    }
    const myPromptsEnabled = isInternalUser(endpoint)

    return (
        <div className="inner-container">
            <div className="non-transcript-container">
                <div className={styles.recipes}>
                    {myPromptsEnabled && (
                        <>
                            <div>
                                <div className={styles.recipesHeader}>
                                    <span>My Prompts</span>
                                    <VSCodeButton
                                        type="button"
                                        appearance="icon"
                                        onClick={() => onMyPromptClick('add')}
                                    >
                                        <i
                                            className="codicon codicon-plus"
                                            title="Create a new recipe with custom prompt"
                                        />
                                    </VSCodeButton>
                                </div>
                                <small className={styles.recipesNotes}>
                                    To create a Workspace recipe that is available to all users, add a new recipe item
                                    to the .vscode/cody.json file located in your repository. You can also click the +
                                    button above to create a new User recipe.
                                </small>
                            </div>
                            {!myPrompts?.length && (
                                <VSCodeButton
                                    className={styles.recipeButton}
                                    type="button"
                                    onClick={() => onMyPromptClick('add-workspace-file')}
                                >
                                    Create cody.json file for Workspace with examples
                                </VSCodeButton>
                            )}
                            {!myPrompts?.length && (
                                <VSCodeButton
                                    className={styles.recipeButton}
                                    type="button"
                                    onClick={() => onMyPromptClick('add-user-file')}
                                >
                                    Create cody.json file for User with examples
                                </VSCodeButton>
                            )}
                            {myPrompts?.map(promptID => (
                                <VSCodeButton
                                    key={promptID}
                                    className={styles.recipeButton}
                                    type="button"
                                    onClick={() => onMyPromptClick(promptID)}
                                >
                                    {promptID}
                                </VSCodeButton>
                            ))}
                            {myPrompts?.length && (
                                <VSCodeButton
                                    className={styles.recipeButton}
                                    type="button"
                                    onClick={() => onMyPromptClick('clear')}
                                >
                                    Remove cody.json for User Recipes
                                </VSCodeButton>
                            )}
                            <div className={styles.recipesHeader}>
                                <span>Featured</span>
                            </div>
                        </>
                    )}
                    {Object.entries(recipesList).map(([key, value]) => (
                        <VSCodeButton
                            key={key}
                            className={styles.recipeButton}
                            type="button"
                            onClick={() => onRecipeClick(key as RecipeID)}
                        >
                            {value}
                        </VSCodeButton>
                    ))}
                </div>
            </div>
        </div>
    )
}
