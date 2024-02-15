export class CodePrinter {
    public out: string[] = []
    public indent = 0
    private printIndent(): void {
        this.out.push(' '.repeat(this.indent))
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
