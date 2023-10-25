package main

func main() {
	bufch := make(chan int, 1) // Add buffer size to make channel buffered
	run(bufch)
}
