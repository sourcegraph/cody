import { Color } from './basic-types';
import { LabelledValue, printLabel } from './interfaces';

interface GreeterConfig {
    message: string
}

export class Greeter {
    greeting: string;

    constructor(config: GreeterConfig ) {
        this.greeting = config.message;
    }

    greet() {
        return "Hello, " + this.greeting;
    }
}

export class Animal {
    name: string;
    color: Color;

    constructor(name: string, color: Color) {
        this.name = name;
        this.color = color;
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
