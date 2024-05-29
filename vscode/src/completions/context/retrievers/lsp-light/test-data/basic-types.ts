export let isDone: boolean = false;
export let decimal: number = 6;
export let color: string = "blue";

export let list: number[] = [1, 2, 3];
export let tuple: [string, number];
tuple = ["hello", 10];

export enum Color { Red, Green, Blue }
export let c: Color = Color.Green;

export let notSure: any = 4;
notSure = "maybe a string instead";
notSure = false;

export function warnUser(): void {
    console.log("This is my warning message");
}
