import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

import { CodyPrompt } from '../src/my-cody/const'

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

const RecipeTypeGetStartedMessage = {
    user: 'User Recipes are accessible only to you across Workspaces',
    workspace: 'Workspace Recipes are available to all users in your current repository',
}

export const Recipes: React.FunctionComponent<{
    vscodeAPI: VSCodeWrapper
    myPrompts: [string, CodyPrompt][] | null
}> = ({ vscodeAPI, myPrompts }) => {
    const onRecipeClick = (recipeID: RecipeID): void => {
        vscodeAPI.postMessage({ command: 'executeRecipe', recipe: recipeID })
    }
    const onMyPromptClick = (promptID: string, value?: 'user' | 'workspace'): void => {
        vscodeAPI.postMessage({ command: 'my-prompt', title: promptID, value })
    }
    const myPromptsEnabled = myPrompts !== null
    const myRecipesList = {
        user: myPrompts?.filter(recipe => recipe[1].type === 'user'),
        workspace: myPrompts?.filter(recipe => recipe[1].type === 'workspace'),
        default: myPrompts?.filter(recipe => recipe[1].type === 'default'),
    }

    const RecipeSection = (type: 'user' | 'workspace' | 'default'): JSX.Element => (
        <>
            <div className={styles.recipesHeader}>
                <span>{type} recipes</span>
            </div>
            {myRecipesList[type]?.map(recipe => (
                <VSCodeButton
                    key={recipe[0]}
                    className={styles.recipeButton}
                    type="button"
                    onClick={() => onMyPromptClick(recipe[0])}
                >
                    {recipe[0]}
                </VSCodeButton>
            ))}
            {!myRecipesList[type]?.length && type !== 'default' && (
                <VSCodeButton
                    className={styles.recipeButton}
                    type="button"
                    onClick={() => onMyPromptClick('add', type)}
                    title={RecipeTypeGetStartedMessage[type]}
                >
                    Get Started
                </VSCodeButton>
            )}
        </>
    )

    return (
        <div className="inner-container">
            <div className="non-transcript-container">
                <div className={styles.recipes}>
                    {myPromptsEnabled ? (
                        <>
                            <div>
                                <div
                                    title="Custom Recipes let you build your own reusable prompts with tailored contexts."
                                    className={styles.recipesHeader}
                                >
                                    <span>Custom Recipes - Experimental</span>
                                    <VSCodeButton
                                        type="button"
                                        appearance="icon"
                                        onClick={() => onMyPromptClick('menu')}
                                    >
                                        <i className="codicon codicon-settings" title="Open Custom Recipes Menu" />
                                    </VSCodeButton>
                                </div>
                            </div>
                            {RecipeSection('user')}
                            {RecipeSection('workspace')}
                            {RecipeSection('default')}
                        </>
                    ) : (
                        <>
                            <div className={styles.recipesHeader}>
                                <span>Featured Recipes</span>
                            </div>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
