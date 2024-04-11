import * as vscode from 'vscode'
import { transformEmojiToSvg } from './utils'

const TUTORIAL_EMOJIS = {
    Intro: '&#128075;', // 👋
    Todo: '&#128073;', // 👉
    Done: '&#x2705;', // ✅
}

export const INTRO_DECORATION = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Intro),
    gutterIconSize: 'contain',
})
export const TODO_DECORATION = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Todo),
    gutterIconSize: 'contain',
})
export const COMPLETE_DECORATION = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Done),
    gutterIconSize: 'contain',
})
