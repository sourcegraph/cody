package main

func main() {
	dir, _ := Open(OpenOpt{
        █
		Path: PathOpt{P: "file.txt"},
	})
	_ = dir
}
