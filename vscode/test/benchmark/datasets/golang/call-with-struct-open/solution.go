package main

func main() {
	dir, err := Open(OpenOpt{
		Dir:  "test/benchmark/datasets/foo/struct-fields",
		Path: "file.txt",
	})
	_ = dir
	_ = err
}
