package main

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// ANSI color constants (for string interpolation contexts)
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

var (
	styleTitle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7c6ff0"))
	styleStepNum = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#5b8def"))
	styleStepTxt = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#e0e0f0"))
	styleSuccess = lipgloss.NewStyle().Foreground(lipgloss.Color("#36d399"))
	styleError   = lipgloss.NewStyle().Foreground(lipgloss.Color("#f472b6"))
	styleInfo    = lipgloss.NewStyle().Foreground(lipgloss.Color("#8a8a9a"))
	styleWarning = lipgloss.NewStyle().Foreground(lipgloss.Color("#fbbf24"))
	styleBorder  = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#5b8def")).
			Width(42).
			Align(lipgloss.Center)
)

func init() {
	if runtime.GOOS == "windows" {
		enableWindowsAnsi()
	}
}

func printStep(step int, total int, msg string) {
	label := styleStepNum.Render(fmt.Sprintf(" %d/%d ", step, total))
	text := styleStepTxt.Render(msg)
	sep := lipgloss.NewStyle().Foreground(lipgloss.Color("#444")).Render("│")
	fmt.Printf("\n  %s %s %s\n", label, sep, text)
}

func printSuccess(msg string) {
	fmt.Printf("  %s %s\n", styleSuccess.Render("◆"), styleSuccess.Render(msg))
}

func printError(msg string) {
	fmt.Printf("  %s %s\n", styleError.Render("▲"), styleError.Render(msg))
}

func printInfo(msg string) {
	fmt.Printf("  %s\n", styleInfo.Render(msg))
}

func printWarning(msg string) {
	fmt.Printf("  %s %s\n", styleWarning.Render("⚠"), styleWarning.Render(msg))
}

func printBanner() {
	title := styleTitle.Render("OurClass 安装程序")
	sub := lipgloss.NewStyle().Foreground(lipgloss.Color("#6a6a8a")).Render("班级管理系统一键部署")
	fmt.Println()
	fmt.Println("  " + styleBorder.Render(title+"\n"+sub))
	fmt.Println()
}

func promptYesNo(msg string) bool {
	fmt.Printf("\n  %s [Y/n]: ", styleWarning.Render(msg))
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

func waitForExit() {
	fmt.Printf("\n  %s", styleInfo.Render("按 Enter 键退出..."))
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}
