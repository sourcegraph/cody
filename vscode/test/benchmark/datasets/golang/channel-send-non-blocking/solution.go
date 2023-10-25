package main

import "fmt"

func main() {
	fmt.Println("start")
	ch := make(chan Status)
	run(ch)
	ch <- StatusInProgress
	for {
		// Do not block
		select {
		case ch <- StatusSuccess:
			break
		default:
			// handle timeout
		}
	}
}
