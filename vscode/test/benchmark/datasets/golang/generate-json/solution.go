package main

import (
	"fmt"
)

func main() {
	resp, err := parse(`{
        "Value": "foo",
        "Code": 200,
        "Error": null,
        "Debug": {
            "ID": "123"
        }
    }`)
	if err != nil {
		panic(err)
	}
	fmt.Println(resp)
}
