export class Buckets<T extends string = string> {
    constructor(private readonly maxCountPerKey: number) {}
    private map = new Map<T, number>()
    public count(key: T): number {
        return this.map.get(key) ?? 0
    }
    public peek(key: T): boolean {
        return this.count(key) < this.maxCountPerKey
    }
    public acquire(key: T): boolean {
        let count = this.count(key)
        count++
        if (count > this.maxCountPerKey) {
            return false
        }
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
