package main

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strings"
)

// ANSI color codes
const (
	ColorReset  = "\033[0m"
	ColorRed    = "\033[31m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorCyan   = "\033[36m"
	ColorGray   = "\033[90m"
	ColorBold   = "\033[1m"
)

func init() {
	if runtime.GOOS == "windows" {
		enableWindowsAnsi()
	}
}

func printStep(step int, total int, msg string) {
	fmt.Printf("\n%s[%d/%d]%s %s%s%s\n", ColorCyan, step, total, ColorReset, ColorBold, msg, ColorReset)
}

func printSuccess(msg string) {
	fmt.Printf("  %s✅ %s%s\n", ColorGreen, msg, ColorReset)
}

func printError(msg string) {
	fmt.Printf("  %s❌ %s%s\n", ColorRed, msg, ColorReset)
}

func printInfo(msg string) {
	fmt.Printf("  %s%s%s\n", ColorGray, msg, ColorReset)
}

func printWarning(msg string) {
	fmt.Printf("  %s⚠️  %s%s\n", ColorYellow, msg, ColorReset)
}

func printBanner() {
	fmt.Printf(`
%s╔══════════════════════════════════════╗
║      OurClass 安装程序 v1.0          ║
╚══════════════════════════════════════╝%s
`, ColorCyan, ColorReset)
}

func promptYesNo(msg string) bool {
	fmt.Printf("\n%s%s [Y/n]: %s", ColorYellow, msg, ColorReset)
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		input := strings.TrimSpace(strings.ToLower(scanner.Text()))
		return input == "" || input == "y" || input == "yes"
	}
	return false
}

func exitWithError(msg string) {
	printError(msg)
	os.Exit(1)
}

// waitForExit waits for user to press Enter before the program exits.
// Prevents terminal window from closing immediately when double-clicked.
func waitForExit() {
	fmt.Printf("\n%s按 Enter 键退出...%s", ColorGray, ColorReset)
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}
