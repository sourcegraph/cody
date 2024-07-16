import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
    $getNodeByKey,
    $getSelection,
    $isNodeSelection,
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
    KEY_BACKSPACE_COMMAND,
    KEY_DELETE_COMMAND,
    KEY_ENTER_COMMAND,
    type NodeKey,
    SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useRef } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/shadcn/ui/tooltip'
import { $isTemplateInputNode, type TemplateInputNode } from './TemplateInputNode'

export const TemplateInputComponent: React.FC<{
    nodeKey: NodeKey
    node: TemplateInputNode
    className?: string
}> = ({ nodeKey, node, className }) => {
    const [editor] = useLexicalComposerContext()
    const [isSelected] = useLexicalNodeSelection(nodeKey)
    const ref = useRef<HTMLSpanElement>(null)

    const handleEvent = useCallback(() => {
        editor.update(() => {
            const node = $getNodeByKey(nodeKey)
            if (!$isTemplateInputNode(node)) {
                return
            }
            const next = node.getNextSibling()
            node.remove()
            next?.selectStart()
        })
    }, [nodeKey, editor])

    const onDelete = useCallback(
        (event: KeyboardEvent) => {
            if (isSelected && $isNodeSelection($getSelection())) {
                event.preventDefault()
                handleEvent()
                return true
            }
            return false
        },
        [isSelected, handleEvent]
    )

    const onClick = useCallback(
        (event: MouseEvent) => {
            if (event.target === ref.current || ref.current?.contains(event.target as Node)) {
                event.preventDefault()
                handleEvent()
                return true
            }
            return false
        },
        [handleEvent]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
                event.preventDefault()
                handleEvent()
            }
        },
        [handleEvent]
    )

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
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
    }, [editor, onClick, onDelete, onKeyDown, isSelected])

    const tooltip = node.templateInput.placeholder
    const text = node.templateInput.placeholder

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span ref={ref} className={className}>
                    <span>{text}</span>
                </span>
            </TooltipTrigger>
            {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
        </Tooltip>
    )
}
