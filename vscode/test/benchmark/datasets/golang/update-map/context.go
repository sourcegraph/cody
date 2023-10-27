package main

import "encoding/json"

type Response struct {
	Value string
	Code  int
	Error error
	Debug struct {
		ID string
	}
}

func parse(respJSON string) (Response, error) {
	var resp Response
	err := json.Unmarshal([]byte(respJSON), &resp)
	return resp, err
}
