import isEqual from 'deep-equal'

export function areSame(obj1: any, obj2: any): boolean {
    return isEqual(obj1, obj2)
}
