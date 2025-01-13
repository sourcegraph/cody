/*
<<<<
func parseArgs(arguments []string) (args, error) {
	if len(arguments) < 2 {
		return args{}, errors.New("missing arguments")
	} else if len(arguments) > 2 {
		return args{}, errors.New("too many arguments")
	}
}
====
func parseArgs(args []string) (args, error) {
	if len(args) < 2 {
		return args{}, errors.New("missing arguments")
	} else if len(args) > 2 {
		return args{}, errors.New("too many arguments")
	}
}
>>>>
*/


func parseArgs(arguments []string) (args, error) {
	if len(arguments) < 2 {
		return args{}, errors.New("missing arguments")
	} else if len(arguments) > 2 {
		return args{}, errors.New("too many arguments")
	}
}
