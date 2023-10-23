import { Organ } from './organ'

export class CompoundOrgan extends Organ {
    public children: Organ[] = []
    public name: string

    constructor(name: string) {
        super()
        this.name = name
    }

    public getInformation() {
        let output = `- This is ${this.name} organ.`
        output += ` It contains ${this.children.length} members \n`

        this.children.forEach(organ => {
            output += organ.getInformation()
        })

        return output
    }

    getRevenue(): number {
        let output = 0

        this.children.forEach(organ => {
            output += organ.getRevenue()
        })

        return output
    }

    public add(organ: Organ): void {
        this.children.push(organ)
    }

    public remove(organ: Organ): void {
        const index = this.children.indexOf(organ)
        this.children.splice(index, 1)
    }
}
