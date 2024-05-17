import { Color, warnUser } from './basic-types';
import { LabelledValue, printLabel, SquareConfig, createSquare } from './interfaces';
import { Greeter, Dog, LabelledDog } from './classes';
import { getName, Container, labelledBox } from './advanced-types';
import { identity, createLabelledSquare, createLabelledDogContainer } from './generics';

// Using various types and functions from different files
warnUser();

let greeter = new Greeter("world");
console.log(greeter.greet());

let dog = new Dog("Buddy", Color.Green);
dog.bark();
dog.move(10);

let labelledDog = new LabelledDog("Buddy", Color.Green, "Friendly Dog");
printLabel(labelledDog);

let squareConfig: SquareConfig = { color: "blue", width: 5 };
let square = createSquare(squareConfig);
console.log(`Square: color = ${square.color}, area = ${square.area}`);

let labelledSquare = createLabelledSquare({ color: "blue", width: 10 });
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
