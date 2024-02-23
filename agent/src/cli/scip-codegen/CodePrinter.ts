export class CodePrinter {
    public out: string[] = []
    public indent = 0
    private printIndent(): void {
        this.out.push(' '.repeat(this.indent))
    }

    public addImport(text: string): void {
        if (this.out.find(line => line.includes(text))) {
            return
        }
        const importIndex = this.out.findIndex(line => line.startsWith('import '))
        if (importIndex >= 0) {
            this.out[importIndex] = `${text}\n${this.out[importIndex]}`
            return
        }
        const packageIndex = this.out.findIndex(line => line.startsWith('package '))
        if (packageIndex >= 0) {
            this.out[packageIndex] = `${this.out[packageIndex]}\n\n${text}`
            return
        }
        throw new Error(`Could not find import or package statement in ${this.out.join('\n')}`)
    }

    public sectionComment(label: string): void {
        const header = '='.repeat(label.length)
        this.line(`// ${header}`)
        this.line(`// ${label}`)
        this.line(`// ${header}`)
    }

    public line(text?: string): void {
        if (text) {
            this.printIndent()
            this.out.push(text)
        }
        this.out.push('\n')
    }
    public block(handler: () => void): void {
        this.indent += 2
        handler()
        this.indent -= 2
    }
    public build(): string {
        return this.out.join('')
    }
}
