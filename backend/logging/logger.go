package logging

import (
	"log"
)

func INFO(message string) {
	log.Println("[INFO] ", message)
}
func WARN(message string) {
	log.Println("[WARN] ", message)
}
func ERROR(message string) {
	log.Println("[ERROR] ", message)
}
func FATAL(message string) {
	log.Println("[FATAL!] ", message)
}
