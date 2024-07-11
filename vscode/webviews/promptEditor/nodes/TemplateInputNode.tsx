import { TEMPLATE_INPUT_NODE_TYPE } from '@sourcegraph/cody-shared'
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
    public value: string

    static getType(): typeof TEMPLATE_INPUT_NODE_TYPE {
        return TEMPLATE_INPUT_NODE_TYPE
    }

    static clone(node: TemplateInputNode): TemplateInputNode {
        return new TemplateInputNode(node.templateText, node.state, node.key)
    }

    constructor(
        public templateText: string,
        public state: TemplateInputState = 'unset',
        private key?: NodeKey
    ) {
        super(key)
        this.value = ''
    }

    createDOM(): HTMLElement {
        return document.createElement('span')
    }

    updateDOM(): boolean {
        return false
    }

    getTextContent(): string {
        return this.state === 'unset' ? this.templateText : this.value
    }

    decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
        return (
            <TemplateInputComponent
                nodeKey={this.getKey()}
                node={this}
                className={`${styles.templateInputNode} ${styles[this.state]}`}
                focusedClassName={styles.focused}
            />
        )
    }

    setState(state: TemplateInputState): void {
        this.state = state
    }

    setValue(value: string): void {
        this.value = value
    }
}

export function $createTemplateInputNode(templateText: string): TemplateInputNode {
    return $applyNodeReplacement(new TemplateInputNode(templateText))
}

export function $isTemplateInputNode(node: unknown): node is TemplateInputNode {
    return node instanceof TemplateInputNode
}
