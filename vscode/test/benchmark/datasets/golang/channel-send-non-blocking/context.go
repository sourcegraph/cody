package main

import "fmt"

type Status int

const (
	StatusError Status = iota
	StatusSuccess
	StatusInProgress
)

func run(ch chan Status) {
	go func() {
		for status := range ch {
			fmt.Println(status)
		}
	}()
}
