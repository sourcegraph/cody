export class Buckets<T extends string = string> {
    constructor(private readonly maxCountPerKey: number) {}
    private map = new Map<T, number>()
    public count(key: T): number {
        return this.map.get(key) ?? 1
    }
    public peek(key: T): boolean {
        return this.count(key) < this.maxCountPerKey
    }
    public acquire(key: T): boolean {
        if (!this.peek(key)) {
            return false
        }
        let count = this.count(key)
        count++
        this.map.set(key, count)
        return true
    }
}

export class AggregateBuckets<T extends string = string> {
    constructor(private readonly buckets: Buckets<T>[]) {}
    public peek(key: T): boolean {
        return this.buckets.every(b => b.peek(key))
    }
    public acquire(key: T): boolean {
        return this.buckets.every(b => b.acquire(key))
    }
}
