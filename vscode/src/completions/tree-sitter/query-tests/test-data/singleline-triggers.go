package main

// Matches empty struct

type Creature struct {
	//               |
}

// ------------------------------------
// Does not match non-empty struct

type Animal struct {
	//             |
	Name string
	Type string
}

// ------------------------------------
// Matches empty struct

var person = struct {
	//              |
}{}

// ------------------------------------
// Does not match non-empty struct

var human = struct {
	//             |
	FirstName string
	LastName  string
}{
	FirstName: "John",
	LastName:  "Doe",
}

// ------------------------------------
// Does not match function declaration

func greet() {
	//       |
}

// ------------------------------------
// Matches empty nested interface

func wrap() {
	type Writer interface {
		//                |
	}
}
