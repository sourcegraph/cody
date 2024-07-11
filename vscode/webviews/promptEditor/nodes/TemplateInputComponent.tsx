import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
    $getNodeByKey,
    $getSelection,
    $isNodeSelection,
    $setSelection,
    BLUR_COMMAND,
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
    KEY_BACKSPACE_COMMAND,
    KEY_DELETE_COMMAND,
    KEY_ENTER_COMMAND,
    type NodeKey,
    SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/shadcn/ui/tooltip'
import { $isTemplateInputNode, type TemplateInputNode } from './TemplateInputNode'
import { useIsFocused } from './mentionUtils'

export const TemplateInputComponent: React.FC<{
    nodeKey: NodeKey
    node: TemplateInputNode
    className?: string
    focusedClassName?: string
}> = ({ nodeKey, node, className, focusedClassName }) => {
    const [editor] = useLexicalComposerContext()
    const isEditorFocused = useIsFocused()
    const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
    const ref = useRef<HTMLSpanElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const [inputValue, setInputValue] = useState(node.getTextContent())

    const composedClassNames = useMemo(() => {
        const classes = [className]
        if (isSelected && isEditorFocused && focusedClassName) {
            classes.push(focusedClassName)
        }
        return classes.join(' ').trim() || undefined
    }, [isSelected, className, focusedClassName, isEditorFocused])

    const onDelete = useCallback(
        (event: KeyboardEvent) => {
            if (isSelected && $isNodeSelection($getSelection())) {
                event.preventDefault()
                const node = $getNodeByKey(nodeKey)
                if ($isTemplateInputNode(node)) {
                    node.remove()
                }
                return true
            }
            return false
        },
        [isSelected, nodeKey]
    )

    const onClick = useCallback(
        (event: MouseEvent) => {
            if (event.target === ref.current || ref.current?.contains(event.target as Node)) {
                if (!event.shiftKey) {
                    clearSelection()
                }
                setSelected(true)
                node.setState('focused')
                inputRef.current?.focus()
                return true
            }
            return false
        },
        [clearSelection, setSelected, node]
    )

    const onBlur = useCallback(() => {
        node.setState('set')
        node.setValue(inputValue)
        return false
    }, [node, inputValue])

    const onInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(event.target.value)
    }, [])

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
                event.preventDefault()
                node.setState('set')
                node.setValue(inputValue)
                $setSelection(null)
            }
        },
        [node, inputValue]
    )

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(BLUR_COMMAND, onBlur, COMMAND_PRIORITY_LOW),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    return false
                },
                COMMAND_PRIORITY_LOW
            ),
            editor.registerCommand(
                KEY_ENTER_COMMAND,
                event => {
                    if (isSelected) {
                        onKeyDown(event as unknown as React.KeyboardEvent<HTMLInputElement>)
                        return true
                    }
                    return false
                },
                COMMAND_PRIORITY_LOW
            )
        )
    }, [editor, onClick, onDelete, onBlur, onKeyDown, isSelected])

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span ref={ref} className={composedClassNames}>
                    {node.state === 'unset' ? (
                        <span>{node.templateText}</span>
                    ) : (
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={onInputChange}
                            onKeyDown={onKeyDown}
                            onBlur={onBlur}
                        />
                    )}
                </span>
            </TooltipTrigger>
            {node.state === 'unset' && <TooltipContent>{node.templateText}</TooltipContent>}
        </Tooltip>
    )
}
