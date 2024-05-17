import { Color } from './basic-types';
import { LabelledValue, printLabel } from './interfaces';

export class Greeter {
    greeting: string;

    constructor(message: string) {
        this.greeting = message;
    }

    greet() {
        return "Hello, " + this.greeting;
    }
}

export class Animal {
    name: string;
    color: Color;

    constructor(theName: string, theColor: Color) {
        this.name = theName;
        this.color = theColor;
    }

    move(distanceInMeters: number = 0) {
        console.log(`${this.name} moved ${distanceInMeters}m. Color: ${Color[this.color]}`);
    }
}

export class Dog extends Animal {
    bark() {
        console.log("Woof! Woof!");
    }
}

export class LabelledDog extends Dog implements LabelledValue {
    label: string;

    constructor(name: string, color: Color, label: string) {
        super(name, color);
        this.label = label;
    }
}
