package logger

import (
	"log"
)

var DebugMode bool = false

func INFO(message string) {
	if DebugMode {
		log.Println("[INFO] ", message)
	}
}

func Infof(format string, v ...any) {
	if DebugMode {
		log.Printf("[INFO] "+format, v...)
	}
}

func WARN(message string) {
	if DebugMode {
		log.Println("[WARN] ", message)
	}
}

func Warnf(format string, v ...any) {
	if DebugMode {
		log.Printf("[WARN] "+format, v...)
	}
}

func ERROR(message string) {
	if DebugMode {
		log.Println("[ERROR] ", message)
	}
}

func Errorf(format string, v ...any) {
	if DebugMode {
		log.Printf("[ERROR] "+format, v...)
	}
}

func FATAL(message string) {
	if DebugMode {
		log.Println("[FATAL!] ", message)
	}
}

func Fatalf(format string, v ...any) {
	if DebugMode {
		log.Printf("[FATAL!] "+format, v...)
	}
}

func Printf(format string, v ...any) {
	if DebugMode {
		log.Printf(format, v...)
	}
}
