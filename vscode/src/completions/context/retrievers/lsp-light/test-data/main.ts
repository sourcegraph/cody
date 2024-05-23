import { Color, warnUser } from './basic-types';
import { LabelledValue, printLabel, printLabelAndSquare } from './interfaces';
import { Background, SquareConfig, createSquare } from './squares';
import { Greeter, Dog, LabelledDog } from './classes';
import { getName, Container, labelledBox } from './advanced-types';
import { identity, createLabelledSquare, createLabelledDogContainer } from './generics';

// Using various types and functions from different files
warnUser();

let greeter = new Greeter({ message: "world" });
console.log(greeter.greet());

let dog = new Dog("Buddy", Color.Green);
dog.bark();
dog.move(10);

let labelledDog = new LabelledDog("Buddy", Color.Green, "Friendly Dog");
printLabel(labelledDog);
const printedSquare = printLabelAndSquare(labelledDog);
console.log(printedSquare)

export function createSquareConfig(): SquareConfig {
    return { color: Color.Blue, width: 5 }
}

let squareConfig: SquareConfig = { color: Color.Blue, width: 5 };
let square = createSquare(squareConfig);
console.log(`Square: color = ${square.color}, area = ${square.area}`);

let labelledSquare = createLabelledSquare({ color: Color.Blue, width: 10 });
console.log(labelledSquare.value);

let myLabelledDogContainer = createLabelledDogContainer("Buddy", Color.Green, "Friendly Dog");
console.log(myLabelledDogContainer.value.label);

let name: string = getName("Alice");
console.log(name);

let boxContent = labelledBox.contents;
console.log(boxContent);

let numberIdentity = identity<number>(42);
console.log(numberIdentity);

let stringIdentity = identity<string>("Hello");
console.log(stringIdentity);

const background: Background = {
    items: [square, square],
    name: 'my background'
}
const area = background.items[0].area
console.log(background, area)
