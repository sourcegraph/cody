package main

// Immediately writes to ch, so pass a buffered channel
func run(ch chan int) {
	ch <- -1
}
