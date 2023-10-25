package main

import "fmt"

func main() {
	fmt.Println("start")
	ch := make(chan Status)
	run(ch)
	ch <- StatusInProgress
}
