package main

import (
	"encoding/json"
	"fmt"
)

func main() {
	resp := work()
	json, err := json.Marshal(resp)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(json))
}
