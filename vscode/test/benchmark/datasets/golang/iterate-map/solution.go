package main

import (
	"fmt"
)

func main() {
	resp := work()
	for k, v := range resp {
		fmt.Println(k, v)
	}
}
