package main

import (
	"fmt"
)

func doWork() (date string) {
	return work().Format("2006-01-02 15:04:05")
}

func main() {
	fmt.Println(doWork())
}
