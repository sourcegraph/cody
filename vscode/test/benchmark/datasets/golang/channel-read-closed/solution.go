package main

import "fmt"

func main() {
	fmt.Println("start")
	ch := run(-1)
	for {
		v, ok := <-ch
		if !ok {
			break
		}
		fmt.Println(v)
	}
}
