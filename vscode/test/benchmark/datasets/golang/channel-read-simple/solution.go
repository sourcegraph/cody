package main

import "fmt"

func main() {
	fmt.Println("start")
	ch := run(-1)
	status := <-ch
	fmt.Println(status)
}
