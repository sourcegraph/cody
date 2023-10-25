package main

import "time"

type Status int

const (
	StatusError Status = iota
	StatusSuccess
	StatusInProgress
)

func run(x int) chan Status {
	ch := make(chan Status, 1)
	ch <- StatusInProgress
	go func() {
		time.Sleep(30 * time.Millisecond)
		if x < 0 {
			ch <- StatusError
		} else {
			ch <- StatusSuccess
		}
	}()
	return ch
}
