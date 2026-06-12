//go:build windows

package main

import (
	"os"
	"syscall"
	"unsafe"
)

var (
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	procGetConsoleMode      = kernel32.NewProc("GetConsoleMode")
	procSetConsoleMode      = kernel32.NewProc("SetConsoleMode")
	procGetConsoleOutputCP  = kernel32.NewProc("GetConsoleOutputCP")
	procSetConsoleOutputCP  = kernel32.NewProc("SetConsoleOutputCP")
)

const enableVirtualTerminalProcessing = 0x0004

// enableWindowsAnsi enables ANSI escape code support on Windows 10+.
// On older Windows, ANSI codes will be shown as garbage — this is acceptable
// since Windows 7/8 are EOL and Windows 10+ supports VT sequences.
func enableWindowsAnsi() {
	handle := syscall.Handle(os.Stdout.Fd())
	var mode uint32

	// Get current console mode
	r, _, _ := procGetConsoleMode.Call(uintptr(handle), uintptr(unsafe.Pointer(&mode)))
	if r == 0 {
		return // Can't get mode, give up
	}

	// Enable Virtual Terminal Processing
	procSetConsoleMode.Call(uintptr(handle), uintptr(mode|enableVirtualTerminalProcessing))

	// Also set console output code page to UTF-8 (65001)
	procSetConsoleOutputCP.Call(65001)
}
