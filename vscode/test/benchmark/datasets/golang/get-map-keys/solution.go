package main

import (
	"fmt"
)

func mapKeys(m map[string]any) []string {
	var keys []string
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func main() {
	resp := work()
	fmt.Println(mapKeys(resp))
}
