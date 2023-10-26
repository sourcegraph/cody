package main

import (
	"fmt"
)

func main() {
	resp := work()
	// Clear the debug info
	delete(resp, "debug")
	fmt.Println(resp)
}
