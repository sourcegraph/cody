import { useState } from 'react'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { CodyPrompt } from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'
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

const CommandTypeGetStartedMessage = {
    user: 'User Recipes are accessible only to you across Workspaces',
    workspace: 'Workspace Recipes are available to all users in your current repository',
}

export const Recipes: React.FunctionComponent<{
    vscodeAPI: VSCodeWrapper
    myPrompts: [string, CodyPrompt][] | null
}> = ({ vscodeAPI, myPrompts }) => {
    const initialState = vscodeAPI.getState() as State | undefined
    const reorderedRecipeList: RecipeListType = initialState?.reorderedRecipes ?? recipesList
    const [recipes, setRecipes] = useState<RecipeListType>(reorderedRecipeList)
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const onRecipeClick = (recipeID: RecipeID): void => {
        vscodeAPI.postMessage({ command: 'executeRecipe', recipe: recipeID })
    }
    const onMyPromptClick = (promptID: string, value?: 'user' | 'workspace'): void => {
        vscodeAPI.postMessage({ command: 'custom-prompt', title: promptID, value })
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
                {type === 'default' ? (
                    <span className={styles.recipesSubHeader}>Commands</span>
                ) : (
                    <span className={styles.recipesSubHeader}>{type} Recipes</span>
                )}
            </div>
            {myRecipesList[type]?.map(recipe => (
                <VSCodeButton
                    key={recipe[0]}
                    className={styles.recipeButton}
                    type="button"
                    onClick={() => onMyPromptClick(recipe[1].prompt)}
                >
                    {recipe[1].name || recipe[0]}
                </VSCodeButton>
            ))}
            {!myRecipesList[type]?.length && type !== 'default' && (
                <VSCodeButton
                    className={styles.recipeButton}
                    type="button"
                    onClick={() => onMyPromptClick('add', type)}
                    title={CommandTypeGetStartedMessage[type]}
                >
                    Get Started
                </VSCodeButton>
            )}
        </>
    )

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
                    {myPromptsEnabled ? (
                        <>
                            <div>
                                <div
                                    title="Custom Commands let you build your own reusable prompts with tailored contexts."
                                    className={styles.recipesHeader}
                                >
                                    <span>Custom Commands - Experimental</span>
                                    <VSCodeButton
                                        type="button"
                                        appearance="icon"
                                        onClick={() => onMyPromptClick('menu')}
                                    >
                                        <i className="codicon codicon-settings" title="Open Custom Commands Menu" />
                                    </VSCodeButton>
                                </div>
                            </div>
                            {RecipeSection('user')}
                            {RecipeSection('workspace')}
                            {RecipeSection('default')}
                        </>
                    ) : (
                        <>
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
                    {Object.entries(recipes).map(([key, value], index) => (
                        <VSCodeButton
                            key={key}
                            className={classNames(
                                styles.recipeButton,
                                index === draggedIndex && styles.recipeButtonDrag
                            )}
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
