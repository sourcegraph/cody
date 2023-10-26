package main

type Response struct {
	Value string
	Code  int
	Error error
	Debug struct {
		ID string
	}
}

func work() map[string]any {
	return map[string]any{
		"value": "abc",
		"code":  200,
		"error": nil,
		"debug": map[string]any{"id": "123"},
	}
}
