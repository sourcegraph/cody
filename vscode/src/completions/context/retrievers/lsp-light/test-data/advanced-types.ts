import { Color } from './basic-types'
import { Dog } from './classes';

export type Name = string;
export type NameResolver = () => string;
export type NameOrResolver = Name | NameResolver;

export function getName(n: NameOrResolver): Name {
    if (typeof n === "string") {
        return n;
    } else {
        return n();
    }
}

export type Container<T> = { value: T };

export let stringContainer: Container<string> = { value: "Hello" };
export let numberContainer: Container<number> = { value: 123 };

export interface Box<T> {
    contents: T;
}

export let box: Box<string> = { contents: "Hello" };

export type DogContainer = Container<Dog>;
export let dogContainer: DogContainer = { value: new Dog("Buddy", Color.Blue) };

export interface LabelledBox<T> extends Box<T> {
    label: string;
}

export let labelledBox: LabelledBox<string> = { contents: "Hello", label: "Labelled Box" };
