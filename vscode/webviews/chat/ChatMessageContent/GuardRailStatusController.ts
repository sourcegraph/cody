import styles from './ChatMessageContent.module.css'

/*
 * GuardrailsStatusController manages the bit of UI with shield icon,
 * and spinner/check mark/status in the bottom-right corner of CodeBlocks
 * when attribution is enabled.
 */
export class GuardrailsStatusController {
    readonly statusSpinning = `<i class="codicon codicon-loading ${styles.codiconLoading}"></i>`
    readonly statusPass = '<i class="codicon codicon-pass"></i>'
    readonly statusFailed = 'Guardrails Check Failed'
    readonly statusUnavailable = 'Guardrails API Error'

    readonly iconClass = 'guardrails-icon'
    readonly statusClass = 'guardrails-status'

    private status: HTMLElement

    constructor(public container: HTMLElement) {
        const elements = this.container.getElementsByClassName(this.statusClass)
        if (elements.length > 0) {
            this.status = elements[0] as HTMLElement
        } else {
            const status = document.createElement('div')
            status.classList.add(styles.status, this.statusClass)
            status.setAttribute('data-testid', 'attribution-indicator')
            this.container.append(status)
            this.status = status
        }
    }

    /**
     * setPending displays a spinner next
     * to the attribution shield icon.
     */
    public setPending() {
        this.container.title = 'Guardrails: Running code attribution check…'
        this.status.innerHTML = this.statusSpinning
    }

    /**
     * setSuccess changes spinner on the right-hand side
     * of shield icon to a checkmark.
     */
    public setSuccess() {
        this.container.title = 'Guardrails check passed'
        this.status.innerHTML = this.statusPass
    }

    /**
     * setFailure displays a failure message instead of spinner
     * on the right-hand side of shield icon. Tooltip indicates
     * where attribution was found, and whether the attribution limit was hit.
     */
    public setFailure(repos: string[], limitHit: boolean) {
        this.container.classList.add(styles.attributionIconFound)
        this.container.title = this.tooltip(repos, limitHit)
        this.status.innerHTML = this.statusFailed
    }

    /**
     * setUnavailable displays a failure message instead of spinner
     * on the right-hand side of shield icon. It indicates that attribution
     * search is unavailable.
     */
    public setUnavailable(error: Error) {
        this.container.classList.add(styles.attributionIconUnavailable)
        this.container.title = `Guardrails API error: ${error.message}`
        this.status.innerHTML = this.statusUnavailable
    }

    private tooltip(repos: string[], limitHit: boolean) {
        const prefix = 'Guardrails check failed. Code found in'
        if (repos.length === 1) {
            return `${prefix} ${repos[0]}.`
        }
        const tooltip = `${prefix} ${repos.length} repositories: ${repos.join(', ')}`
        return limitHit ? `${tooltip} or more...` : `${tooltip}.`
    }
}
