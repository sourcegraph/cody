import { type SerializedTemplateInput, TEMPLATE_INPUT_NODE_TYPE } from '@sourcegraph/cody-shared'
import {
    $applyNodeReplacement,
    DecoratorNode,
    type EditorConfig,
    type LexicalEditor,
    type NodeKey,
} from 'lexical'
import { TemplateInputComponent } from './TemplateInputComponent'
import styles from './TemplateInputNode.module.css'

export type TemplateInputState = 'unset' | 'focused' | 'set'

export class TemplateInputNode extends DecoratorNode<JSX.Element> {
    static getType(): typeof TEMPLATE_INPUT_NODE_TYPE {
        return TEMPLATE_INPUT_NODE_TYPE
    }

    static clone(node: TemplateInputNode): TemplateInputNode {
        return new TemplateInputNode(node.templateInput, node.key)
    }

    constructor(
        public templateInput: SerializedTemplateInput,
        private key?: NodeKey
    ) {
        super(key)
        this.templateInput = templateInput
    }

    createDOM(): HTMLElement {
        return document.createElement('span')
    }

    updateDOM(): boolean {
        return false
    }

    getTextContent(): string {
        return this.templateInput.state === 'unset'
            ? this.templateInput.placeholder
            : this.templateInput.value
    }

    decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
        return (
            <TemplateInputComponent
                nodeKey={this.getKey()}
                node={this}
                className={`${styles.templateInputNode} ${styles[this.templateInput.state]}`}
                focusedClassName={styles.focused}
            />
        )
    }

    setState(state: TemplateInputState): void {
        this.templateInput.state = state
    }

    setValue(value: string): void {
        this.templateInput.value = value
    }
}

export function $createTemplateInputNode(placeholder: string): TemplateInputNode {
    return $applyNodeReplacement(
        new TemplateInputNode({
            state: 'unset',
            value: '',
            placeholder,
        })
    )
}

export function $isTemplateInputNode(node: unknown): node is TemplateInputNode {
    return node instanceof TemplateInputNode
}
