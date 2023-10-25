package main

import "fmt"

func main() {
	fmt.Println("start")
	ch1 := run(-1)
	ch2 := run(1)
	for {
		select {
		case status1 := <-ch1:
			// handle status1
			_ = status1
		case status2 := <-ch2:
			// handle status2
			_ = status2
		default:
			// handle timeout
		}
	}
}
