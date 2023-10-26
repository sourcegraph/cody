package main

import (
	"fmt"
	"time"
)

func main() {
	fmt.Println("start")

	// Measure how long doWork takes
	start := time.Now()
	doWork()
	elapsed := time.Since(start)
	fmt.Println("elapsed:", elapsed)
}
