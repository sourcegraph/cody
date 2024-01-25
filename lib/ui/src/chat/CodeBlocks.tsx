import React, { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import { isError, renderCodyMarkdown, type Guardrails } from '@sourcegraph/cody-shared'

import type { CodeBlockActionsProps } from '../Chat'
import {
    CheckCodeBlockIcon,
    CopyCodeBlockIcon,
    InsertCodeBlockIcon,
    SaveCodeBlockIcon,
    ShieldIcon,
} from '../icons/CodeBlockActionIcons'

import styles from './CodeBlocks.module.css'

interface CodeBlocksProps {
    displayText: string

    copyButtonClassName?: string
    insertButtonClassName?: string

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    metadata?: CodeBlockMeta

    guardrails?: Guardrails
}

export interface CodeBlockMeta {
    source?: string // the name of the executed command that generated the code
    requestID?: string // id of the request that generated the code
}

function createButtons(
    text: string,
    copyButtonClassName?: string,
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit'],
    insertButtonClassName?: string,
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit'],
    metadata?: CodeBlockMeta
): HTMLElement {
    const container = document.createElement('div')
    container.className = styles.container
    if (!copyButtonOnSubmit) {
        return container
    }

    // The container will contain the buttons and the <pre> element with the code.
    // This allows us to position the buttons independent of the code.
    const buttons = document.createElement('div')
    buttons.className = styles.buttons

    const codeBlockActions = {
        copy: copyButtonOnSubmit,
        insert: insertButtonOnSubmit,
    }

    const copyButton = createCodeBlockActionButton(
        'copy',
        text,
        'Copy Code',
        CopyCodeBlockIcon,
        codeBlockActions,
        copyButtonClassName,
        metadata
    )
    buttons.append(copyButton)

    // The insert buttons only exists for IDE integrations
    if (insertButtonOnSubmit) {
        buttons.append(
            createCodeBlockActionButton(
                'insert',
                text,
                'Insert Code at Cursor',
                InsertCodeBlockIcon,
                codeBlockActions,
                insertButtonClassName,
                metadata
            )
        )

        buttons.append(
            createCodeBlockActionButton(
                'new',
                text,
                'Save Code to New File...',
                SaveCodeBlockIcon,
                codeBlockActions,
                insertButtonClassName,
                metadata
            )
        )
    }

    container.append(buttons)

    return container
}

/**
 * Creates a button to perform an action on a code block.
 * @returns The button element.
 */
function createCodeBlockActionButton(
    type: 'copy' | 'insert' | 'new',
    text: string,
    title: string,
    iconSvg: string,
    codeBlockActions: {
        copy: CodeBlockActionsProps['copyButtonOnSubmit']
        insert?: CodeBlockActionsProps['insertButtonOnSubmit']
    },
    className?: string,
    metadata?: CodeBlockMeta
): HTMLElement {
    const button = document.createElement('button')

    const styleClass = type === 'copy' ? styles.copyButton : styles.insertButton

    button.innerHTML = iconSvg
    button.title = title
    button.className = classNames(styleClass, className)

    if (type === 'copy') {
        button.addEventListener('click', () => {
            button.innerHTML = CheckCodeBlockIcon
            navigator.clipboard.writeText(text).catch(error => console.error(error))
            button.className = classNames(styleClass, className)
            codeBlockActions.copy(text, 'Button', metadata)
            setTimeout(() => {
                button.innerHTML = iconSvg
            }, 5000)
        })
    }

    const insertOnSubmit = codeBlockActions.insert
    if (!insertOnSubmit) {
        return button
    }

    switch (type) {
        case 'insert':
            button.addEventListener('click', () => insertOnSubmit(text, false, metadata))
            break
        case 'new':
            button.addEventListener('click', () => insertOnSubmit(text, true, metadata))
            break
    }

    return button
}

class GuardrailsStatusController {
    readonly iconClass = "guardrails-icon";
    readonly spinnerClass = "guardrails-spinner";

    private icon: HTMLElement;
    private spinner: HTMLElement;

    constructor(public container: HTMLElement) {
        this.icon = this.findOrAppend(this.iconClass, () => this.makeIcon());
        this.spinner = this.findOrAppend(this.spinnerClass, () => {
            const spinner = this.makeSpinner();
            this.hide(spinner);
            return spinner;
        });
    }

    public setPending() {
        this.spinner.innerHTML = `<i class="codicon codicon-loading ${styles.codiconLoading}"></i>`;
        this.show(this.spinner);
        this.container.title = "Guard Rails: Running Code Attribution Check…";
    }

    public setSuccess() {
        this.spinner.innerHTML = '<i class="codicon codicon-pass></i>';
        this.show(this.spinner);
        this.icon.classList.add(styles.attributionIconNotFound);
        this.container.title = "Guard Rails Check Passed";
    }

    public setFailure(repos: string[], limitHit: boolean) {
        this.icon.classList.add(styles.attributionIconFound);
        this.hide(this.spinner);
        this.container.title = this.tooltip(repos, limitHit);
    }

    public setUnavailable() {
        this.icon.classList.add(styles.attributionIconUnavailable);
        this.icon.title = "Attribution search unavailable.";
        this.hide(this.spinner);
    }

    private makeIcon(): HTMLElement {
        const icon = document.createElement("div");
        icon.innerHTML = ShieldIcon;
        icon.classList.add(styles.attributionIcon, this.iconClass);
        icon.title = "Attribution search running...";
        icon.setAttribute("data-testid", "attribution-indicator");
        return icon;
    }

    private makeSpinner(): HTMLElement {
        const spinner = document.createElement("div");
        spinner.classList.add(styles.spinner, this.spinnerClass);
        return spinner;
    }

    private findOrAppend(
        className: string,
        make: () => HTMLElement
    ): HTMLElement {
        const elements = this.container.getElementsByClassName(className);
        if (elements.length === 0) {
            const newElement = make();
            this.container.append(newElement);
            return newElement;
        }
        return elements[0] as HTMLElement;
    }

    private hide(element: HTMLElement) {
        element.style.visibility = "hidden";
    }

    private show(element: HTMLElement) {
        element.style.visibility = "visible";
    }

    private tooltip(repos: string[], limitHit: boolean) {
        const prefix = "Guard Rails Check Failed. Code found in";
        if (repos.length === 1) {
            return `${prefix} ${repos[0]}.`;
        }
        const tooltip = `${prefix} ${repos.length} repositories: ${repos.join(
            ", "
        )}`;
        return limitHit ? `${tooltip} or more...` : `${tooltip}.`;
    }
}

export const CodeBlocks: React.FunctionComponent<CodeBlocksProps> = React.memo(
    function CodeBlocksContent({
        displayText,
        copyButtonClassName,
        copyButtonOnSubmit,
        insertButtonClassName,
        insertButtonOnSubmit,
        metadata,
        guardrails,
    }) {
        const rootRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            const preElements = rootRef.current?.querySelectorAll("pre");
            if (!preElements?.length || !copyButtonOnSubmit) {
                return;
            }

            for (const preElement of preElements) {
                const preText = preElement.textContent;
                if (preText?.trim() && preElement.parentNode) {
                    const eventMetadata = {
                        requestID: metadata?.requestID,
                        source: metadata?.source,
                    };
                    const buttons = createButtons(
                        preText,
                        copyButtonClassName,
                        copyButtonOnSubmit,
                        insertButtonClassName,
                        insertButtonOnSubmit,
                        eventMetadata
                    );
                    if (guardrails) {
                        const flexFiller = document.createElement("div");
                        flexFiller.classList.add(styles.flexFiller);
                        buttons.append(flexFiller);
                        const g = new GuardrailsStatusController(buttons);
                        g.setPending();

                        guardrails
                            .searchAttribution(preText)
                            .then((attribution) => {
                                if (isError(attribution)) {
                                    g.setUnavailable();
                                } else if (
                                    attribution.repositories.length === 0
                                ) {
                                    g.setSuccess();
                                } else {
                                    g.setFailure(
                                        attribution.repositories.map(
                                            (r) => r.name
                                        ),
                                        attribution.limitHit
                                    );
                                }
                            })
                            .catch(() => {
                                g.setUnavailable();
                                return;
                            });
                    }

                    // Insert the buttons after the pre using insertBefore() because there is no insertAfter()
                    preElement.parentNode.insertBefore(
                        buttons,
                        preElement.nextSibling
                    );

                    // capture copy events (right click or keydown) on code block
                    preElement.addEventListener("copy", () => {
                        if (copyButtonOnSubmit) {
                            copyButtonOnSubmit(
                                preText,
                                "Keydown",
                                eventMetadata
                            );
                        }
                    });
                }
            }
        }, [
            copyButtonClassName,
            insertButtonClassName,
            copyButtonOnSubmit,
            insertButtonOnSubmit,
            metadata?.requestID,
            metadata?.source,
            guardrails,
        ]);

        return useMemo(
            () => (
                <div
                    ref={rootRef}
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: the result is run through dompurify
                    dangerouslySetInnerHTML={{
                        __html: renderCodyMarkdown(displayText),
                    }}
                />
            ),
            [displayText]
        );
    }
);
