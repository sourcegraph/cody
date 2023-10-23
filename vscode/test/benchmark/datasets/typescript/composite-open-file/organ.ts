export abstract class Organ {
    abstract getInformation(): string

    abstract getRevenue(): number

    public add(organ: Organ): void {}

    public remove(organ: Organ): void {}
}
