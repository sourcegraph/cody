package main

import (
	"errors"
	"fmt"
)

func execute(n int) error {
	if err := validate(n); err != nil {
		return fmt.Errorf("invalid number: %w", err)
	}
	// TODO: implement this
	return nil
}

func main() {
	n := -1
	if err := execute(n); err != nil {
		if isInvalid := errors.Is(err, errInvalid); isInvalid {
			panic(err)
		}
	}
}
