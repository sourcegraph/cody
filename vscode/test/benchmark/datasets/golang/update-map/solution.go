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
	// Update debug ID
	resp.Debug.ID = "456"
	fmt.Println(resp)
}
