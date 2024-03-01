package main

type Creature struct {
	//   |
}

// ------------------------------------

type Animal struct {
	Name string
//   |
	Type string
}

// ------------------------------------

type Stringer interface {
    //   |
    String() string
}

// ------------------------------------

type Stringer interface {
    String() string
    // |
}

// ------------------------------------

type key int
    // |

// ------------------------------------

var person = struct {
	//         |
}{}

// ------------------------------------

var person = struct {
	//  |
}{}

// ------------------------------------

shortDeclaration := 4
//      |

// ------------------------------------

func nestedVar() {
    y := 4
//  |
}

// ------------------------------------

func greet() {
	//  |
}

// ------------------------------------

func (u User) DisplayName() string {
    //           |
    return u.FirstName + " " + u.LastName
}
