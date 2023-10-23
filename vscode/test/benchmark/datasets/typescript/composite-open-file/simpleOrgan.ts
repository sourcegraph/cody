import { Organ } from './organ'

export class SimpleOrgan extends Organ {
    public name: string

    constructor(name: string) {
        super()
        this.name = name
    }

    public getInformation() {
        return `- My name is ${this.name}\n`
    }

    public getRevenue() {
        return Math.floor(Math.random() * 10000) + 1000
    }
}
