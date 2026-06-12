//go:build !windows

package main

// enableWindowsAnsi is a no-op on non-Windows platforms.
func enableWindowsAnsi() {}
