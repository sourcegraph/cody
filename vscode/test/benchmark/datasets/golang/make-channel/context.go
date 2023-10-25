package main

func run(ch chan int) {
	ch <- -1
}
