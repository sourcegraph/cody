package main

import (
	"fmt"
	"reflect"
)

func structToMap(r Response) map[string]any {
	m := make(map[string]any)
	v := reflect.ValueOf(r)
	t := v.Type()

	for i := 0; i < v.NumField(); i++ {
		m[t.Field(i).Name] = v.Field(i).Interface()
	}
	return m
}

func main() {
	fmt.Println(structToMap(work()))
}
