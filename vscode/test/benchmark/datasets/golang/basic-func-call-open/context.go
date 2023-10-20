package main

import "os"

func OpenAbsolutePath(path string) (*os.File, error) {
	return os.Open(path)
}

func OpenAbsoluteDir(dir string) *os.File {
	d, err := os.Open(dir)
	if err != nil {
		panic("TO DO: handle error")
	}
	return d
}
