package main

import (
	"fmt"
)

func main() {
	resp, err := parse(█)
	if err != nil {
		panic(err)
	}
	fmt.Println(resp)
}
