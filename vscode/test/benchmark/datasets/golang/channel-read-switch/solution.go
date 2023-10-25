package main

import "fmt"

func main() {
	fmt.Println("start")
	ch := run(-1)
	for status := range ch {
		switch status {
		case StatusInProgress:
			fmt.Println(status)
		case StatusError:
			fmt.Println(status)
		case StatusSuccess:
			fmt.Println(status)
		}
	}
}
