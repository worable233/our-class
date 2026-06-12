//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

func setPlatformAttributes(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true, // Detach from terminal
	}
}
