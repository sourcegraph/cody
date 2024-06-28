func nestedVar() {
    y := 4
//  |
}

// ------------------------------------

func function() {
    var nestedFunction = func(name string) {
        fmt.Println("Hello,", name)
        //  |
    }
}

// ------------------------------------

func greet() {
	//  |
}

// ------------------------------------

func meet() {
    //  |
}

func greet() {
	pass
}

// ------------------------------------

func (u User) DisplayName() string {
    return u.FirstName + " " + u.LastName
    //           |
}

// ------------------------------------

func funcFactory(mystring string) func(before, after string) string {
    return func(before, after string) string {
    //       |
        return fmt.Sprintf("%s %s %s", before, mystring, after)
    }
}

// ------------------------------------

func funcFactory(mystring string) func(before, after string) string {
    //  |
    return func(before, after string) string {
        return fmt.Sprintf("%s %s %s", before, mystring, after)
    }
}

// ------------------------------------

func() {
    fmt.Println("I'm an anonymous function!")
    //  |
}()

// ------------------------------------

var varFunction = func(name string) {
    fmt.Println("Hello,", name)
    //  |
}
