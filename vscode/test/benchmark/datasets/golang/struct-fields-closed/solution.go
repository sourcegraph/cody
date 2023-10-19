package main

func main() {
	dir, _ := Open(OpenOpt{
		Dir:  "test/benchmark/datasets/foo/struct-fields",
		Path: "file.txt",
	})
	_ = dir
}
