package main

type Response struct {
	Value string
	Code  int
	Error error
	Debug struct {
		ID string
	}
}

func work() Response {
	return Response{Value: "abc", Code: 200, Error: nil, Debug: struct{ ID string }{ID: "123"}}
}
