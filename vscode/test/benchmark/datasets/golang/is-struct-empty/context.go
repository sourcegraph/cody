package main

type Response struct {
	Value string
}

func work() Response {
	return Response{Value: "abc"}
}
