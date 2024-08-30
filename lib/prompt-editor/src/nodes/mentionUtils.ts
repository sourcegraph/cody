import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { BLUR_COMMAND, COMMAND_PRIORITY_NORMAL, FOCUS_COMMAND } from 'lexical'
import { useEffect, useLayoutEffect, useState } from 'react'

// Copied from https://github.com/sodenn/lexical-beautiful-mentions:
//
// MIT License, Copyright (c) 2023 Dennis Soehnen

// TODO(sqs): If https://github.com/facebook/lexical/pull/6282 is not merged and we need Safari
// support, use ZeroWidthNode.

const CAN_USE_DOM: boolean =
    typeof window !== 'undefined' &&
    typeof window.document !== 'undefined' &&
    typeof window.document.createElement !== 'undefined'

export const IS_IOS: boolean =
    CAN_USE_DOM &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    // @ts-ignore
    !window.MSStream

const useLayoutEffectImpl: typeof useLayoutEffect = CAN_USE_DOM ? useLayoutEffect : useEffect

export const useIsFocused = () => {
    const [editor] = useLexicalComposerContext()
    const [hasFocus, setHasFocus] = useState(() =>
        CAN_USE_DOM ? editor.getRootElement() === document.activeElement : false
    )

    useLayoutEffectImpl(() => {
        return mergeRegister(
            editor.registerCommand(
                FOCUS_COMMAND,
                () => {
                    setHasFocus(true)
                    return false
                },
                COMMAND_PRIORITY_NORMAL
            ),
            editor.registerCommand(
                BLUR_COMMAND,
                () => {
                    setHasFocus(false)
                    return false
                },
                COMMAND_PRIORITY_NORMAL
            )
        )
    }, [editor])

    return hasFocus
}
