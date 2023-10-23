package main

import "os"

func main() {
	f, err := os.Open("file.txt")
	_ = f
	_ = err
}
