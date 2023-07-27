import { useState } from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

import { VSCodeWrapper } from './utils/VSCodeApi'

import styles from './Recipes.module.css'

type RecipeListType = Record<string, string>

interface State {
    reorderedRecipes: RecipeListType
}

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
    myPrompts: string[] | null
}> = ({ vscodeAPI, myPrompts }) => {
    const initalState = vscodeAPI.getState() as State | undefined
    const reorderedRecipeList: RecipeListType = initalState?.reorderedRecipes ?? recipesList
    const [recipes, setRecipes] = useState<RecipeListType>(reorderedRecipeList)
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const onRecipeClick = (recipeID: RecipeID): void => {
        vscodeAPI.postMessage({ command: 'executeRecipe', recipe: recipeID })
    }
    const onMyPromptClick = (promptID: string, value?: 'user' | 'workspace'): void => {
        vscodeAPI.postMessage({ command: 'my-prompt', title: promptID, value })
    }
    const myPromptsEnabled = myPrompts !== null

    const handleDragStart = (event: React.DragEvent<HTMLElement>, index: number): void => {
        setDraggedIndex(index)
    }

    const handleDragOver = (event: React.DragEvent<HTMLElement>, index: number): void => {
        event.preventDefault()

        if (draggedIndex !== null && draggedIndex !== index) {
            const newRecipes = Object.entries(recipes)
            const [removedRecipe] = newRecipes.splice(draggedIndex, 1)
            newRecipes.splice(index, 0, removedRecipe)

            const reorderedRecipes: RecipeListType = {} as RecipeListType

            for (const recipe of newRecipes) {
                reorderedRecipes[recipe[0]] = recipe[1]
            }

            setRecipes(reorderedRecipes)
            vscodeAPI.setState({ reorderedRecipes })
            setDraggedIndex(index)
        }
    }

    const handleDragEnd = (): void => {
        setDraggedIndex(null)
    }

    return (
        <div className="inner-container">
            <div className="non-transcript-container">
                <div className={styles.recipes}>
                    {myPromptsEnabled && (
                        <>
                            <div>
                                <div
                                    title="Custom Recipes let you build your own reusable prompts with tailored contexts. Update the recipes field in your `.vscode/cody.json` file to add or remove a recipe."
                                    className={styles.recipesHeader}
                                >
                                    <span>Custom Recipes - Experimental</span>
                                    <VSCodeButton
                                        type="button"
                                        appearance="icon"
                                        onClick={() => onMyPromptClick('menu')}
                                    >
                                        {!myPrompts?.length ? (
                                            <i className="codicon codicon-info" title="More information" />
                                        ) : (
                                            <i className="codicon codicon-tools" title="Open Custom Recipes Menu" />
                                        )}
                                    </VSCodeButton>
                                </div>
                            </div>
                            {!myPrompts?.length && (
                                <>
                                    {myPrompts?.length === 0 && (
                                        <small className={styles.recipesNotes}>
                                            Select a recipe type below to get started:
                                        </small>
                                    )}
                                    <VSCodeButton
                                        className={styles.recipeButton}
                                        type="button"
                                        onClick={() => onMyPromptClick('add', 'user')}
                                        title="User Recipes are accessible only to you across
                                        Workspaces"
                                    >
                                        User Recipes
                                    </VSCodeButton>
                                    <VSCodeButton
                                        className={styles.recipeButton}
                                        type="button"
                                        onClick={() => onMyPromptClick('add', 'workspace')}
                                        title="Workspace Recipes are available to all users in your current
                                        repository"
                                    >
                                        Workspace Recipes
                                    </VSCodeButton>
                                </>
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
                            <div className={styles.recipesHeader}>
                                <span>Featured Recipes</span>
                            </div>
                        </>
                    )}
                    {Object.entries(recipes).map(([key, value], index) => (
                        <VSCodeButton
                            key={key}
                            className={`${styles.recipeButton} ${
                                draggedIndex === index ? styles.recipeButtonDrag : ''
                            }`}
                            type="button"
                            onClick={() => onRecipeClick(key as RecipeID)}
                            draggable={true}
                            onDragStart={e => handleDragStart(e, index)}
                            onDragOver={e => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                        >
                            {value}
                        </VSCodeButton>
                    ))}
                </div>
            </div>
        </div>
    )
}
