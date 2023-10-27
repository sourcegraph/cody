package main

import "fmt"

type Response struct {
	Value string
	Code  int
	Error error
	Debug struct {
		ID string
	}
}

type ResponseID uint64

func generateResponse() ResponseID {
	return 200
}

func log(f float64) {
	fmt.Println(f)
}
