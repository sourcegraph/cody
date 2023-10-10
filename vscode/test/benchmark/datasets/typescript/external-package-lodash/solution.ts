import lodash from 'lodash'

export function areSame(obj1: any, obj2: any): boolean {
    return lodash.isEqual(obj1, obj2)
}
