package main

import "fmt"

type Person struct {
	//             |
	Name string
	Age  int
}

// ------------------------------------

func greet(name string) {
	//                  |
	fmt.Println("Hello,", name)
}

// ------------------------------------

func printNumbers() {
	for i := 0; i < 10; i++ {
		//                  |
		fmt.Println(i)
	}
}

// ------------------------------------

func compare(x int) {
	if x > 5 {
		//   |
		fmt.Println("Greater than 5")
	} else {
		fmt.Println("Less than or equal to 5")
	}
}

// ------------------------------------

var arr = [5]int{
	//          |
	1, 2, 3, 4, 5,
}

// ------------------------------------

var dictionary = map[string]string{
	//                            |
	"apple": "A fruit",
	"book":  "Something you read",
}

// ------------------------------------

type Shape interface {
	//               |
	Area() float64
}
