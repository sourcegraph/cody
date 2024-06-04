// generics.ts
import { Container } from './advanced-types';
import { Dog, LabelledDog } from './classes';
import { createSquare, SquareConfig } from './interfaces';

export function identity<T>(arg: T): T {
    return arg;
}

export let output1 = identity<string>("myString");
export let output2 = identity<number>(100);

export function loggingIdentity<T>(arg: T[]): T[] {
    console.log(arg.length);
    return arg;
}

export let output3 = loggingIdentity<number>([1, 2, 3]);

export interface GenericIdentityFn<T> {
    (arg: T): T;
}

export function identityFn<T>(arg: T): T {
    return arg;
}

export let myIdentity: GenericIdentityFn<number> = identityFn;

export let dogIdentity: GenericIdentityFn<Dog> = identityFn;

export function createLabelledSquare(config: SquareConfig): Container<string> {
    let square = createSquare(config);
    return { value: `Square with color ${square.color} and area ${square.area}` };
}

export function createLabelledDogContainer(name: string, color: Color, label: string): Container<LabelledDog> {
    let labelledDog = new LabelledDog(name, color, label);
    return { value: labelledDog };
}
