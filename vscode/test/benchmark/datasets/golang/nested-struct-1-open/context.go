package main

import (
	"os"
	"path/filepath"
)

type PathOpt struct {
	P string
}

type OpenOpt struct {
	DirOpt struct {
		Dir string
	}
	Path PathOpt
}

func Open(opt OpenOpt) (*os.File, error) {
	return os.Open(filepath.Join(opt.DirOpt.Dir, opt.Path.P))
}
