package main

import (
	"os"
	"path/filepath"
)

type OpenOpt struct {
	Dir, Path string
}

func Open(opt OpenOpt) (*os.File, error) {
	return os.Open(filepath.Join(opt.Dir, opt.Path))
}
