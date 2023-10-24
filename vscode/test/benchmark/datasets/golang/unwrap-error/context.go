package main

import "errors"

var (
	errInvalid = errors.New("invalid")
)

func validate(n int) error {
	if n < 0 {
		return errInvalid
	}
	return nil
}
