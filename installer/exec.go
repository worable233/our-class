package main

import (
	"bufio"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"strings"
)

// runCommand executes a command and streams its output in real-time.
// Returns nil on success, error on failure.
func runCommand(name string, args ...string) error {
	return runCommandInDir("", name, args...)
}

// runCommandInDir executes a command in the given directory with real-time output.
func runCommandInDir(dir string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	if dir != "" {
		cmd.Dir = dir
	}

	// Pipe stdout and stderr in real-time
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start command: %w", err)
	}

	// Stream stdout
	go streamOutput(stdout, "")
	// Stream stderr with prefix
	go streamOutput(stderr, "")

	return cmd.Wait()
}

// runCommandSilent executes a command without showing output.
// Returns combined stdout+stderr output and error.
func runCommandSilent(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// runCommandSilentInDir executes a command in a directory without showing output.
func runCommandSilentInDir(dir string, name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func streamOutput(r io.Reader, prefix string) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if prefix != "" {
			fmt.Printf("  %s%s%s\n", ColorGray, line, ColorReset)
		} else {
			fmt.Printf("  %s\n", line)
		}
	}
}

// getShell returns the appropriate shell for the current OS
func getShell() (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd", []string{"/c"}
	}
	return "sh", []string{"-c"}
}

// commandExists checks if a command is available in PATH
func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

// getNodeVersion returns the Node.js version string, or empty if not installed
func getNodeVersion() string {
	out, err := runCommandSilent("node", "--version")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// getNpmVersion returns the npm version string, or empty if not installed
func getNpmVersion() string {
	out, err := runCommandSilent("npm", "--version")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}
