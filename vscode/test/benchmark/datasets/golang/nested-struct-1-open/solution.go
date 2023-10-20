package main

func main() {
	dir, _ := Open(OpenOpt{
		DirOpt: struct {
			Dir string
		}{Dir: "foo"},
		Path: PathOpt{P: "file.txt"},
	})
	_ = dir
}
