package main

func main() {
	dir, _ := Open(OpenOpt{
		DirOpt: struct {
			Dir string
		}{Dir: "foo"},
        █
	})
	_ = dir
}
