package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// ensureGit checks for Git and installs if missing.
func ensureGit() {
	if commandExists("git") {
		version := getGitVersion()
		printSuccess(fmt.Sprintf("Git %s 已安装", version))
		return
	}

	printInfo("正在安装 Git...")

	switch runtime.GOOS {
	case "windows":
		installGitWindows()
	case "darwin":
		installGitMacOS()
	case "linux":
		installGitLinux()
	default:
		exitWithError("无法自动安装 Git，请手动安装后重试")
	}

	if !commandExists("git") {
		exitWithError("Git 安装后无法检测到，请重启终端后重试")
	}
	printSuccess("Git 安装完成")
}

func installGitWindows() {
	// Download Git for Windows from npmmirror (fast in China)
	filename := "Git-2.47.1.2-64-bit.exe"
	url := fmt.Sprintf("https://npmmirror.com/mirrors/git-for-windows/v2.47.1.windows.1/%s", filename)

	tmpFile := filepath.Join(os.TempDir(), filename)
	if err := downloadFile(url, tmpFile); err != nil {
		// Fallback: try official
		url = "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/" + filename
		if err2 := downloadFile(url, tmpFile); err2 != nil {
			exitWithError(fmt.Sprintf("下载 Git 失败: %v", err2))
		}
	}
	defer os.Remove(tmpFile)

	printInfo("正在静默安装 Git...")
	cmd := exec.Command(tmpFile, "/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS", "/COMPONENTS=icons,ext\\reg\\shellhere,assoc,assoc_sh")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		exitWithError(fmt.Sprintf("安装 Git 失败: %v", err))
	}

	// Add Git to PATH for current process
	gitPaths := []string{
		`C:\Program Files\Git\cmd`,
		`C:\Program Files (x86)\Git\cmd`,
	}
	path := os.Getenv("PATH")
	for _, p := range gitPaths {
		if _, err := os.Stat(filepath.Join(p, "git.exe")); err == nil {
			os.Setenv("PATH", p+";"+path)
			break
		}
	}
}

func installGitMacOS() {
	if commandExists("brew") {
		printInfo("使用 Homebrew 安装 Git...")
		if err := runCommand("brew", "install", "git"); err != nil {
			exitWithError(fmt.Sprintf("安装 Git 失败: %v", err))
		}
		return
	}

	// Install Xcode Command Line Tools
	printInfo("正在安装 Xcode Command Line Tools（含 Git）...")
	printInfo("如果弹出系统对话框，请点击「安装」...")
	if err := runCommand("xcode-select", "--install"); err != nil {
		// xcode-select --install returns error if already installed
		printInfo("可能已安装，继续...")
	}

	// Wait for installation
	if !commandExists("git") {
		printWarning("Git 尚未就绪，可能需要等待 Xcode CLT 安装完成")
		printInfo("安装完成后请重新运行此程序")
		exitWithError("Git 未安装完成")
	}
}

func installGitLinux() {
	if commandExists("apt") {
		printInfo("使用 apt 安装 Git...")
		if err := runCommand("sudo", "apt-get", "update", "-qq"); err != nil {
			exitWithError(fmt.Sprintf("apt update 失败: %v", err))
		}
		if err := runCommand("sudo", "apt-get", "install", "-y", "git"); err != nil {
			exitWithError(fmt.Sprintf("安装 Git 失败: %v", err))
		}
	} else if commandExists("yum") {
		printInfo("使用 yum 安装 Git...")
		if err := runCommand("sudo", "yum", "install", "-y", "git"); err != nil {
			exitWithError(fmt.Sprintf("安装 Git 失败: %v", err))
		}
	} else if commandExists("dnf") {
		printInfo("使用 dnf 安装 Git...")
		if err := runCommand("sudo", "dnf", "install", "-y", "git"); err != nil {
			exitWithError(fmt.Sprintf("安装 Git 失败: %v", err))
		}
	} else if commandExists("pacman") {
		printInfo("使用 pacman 安装 Git...")
		if err := runCommand("sudo", "pacman", "-S", "--noconfirm", "git"); err != nil {
			exitWithError(fmt.Sprintf("安装 Git 失败: %v", err))
		}
	} else {
		exitWithError("无法识别包管理器，请手动安装 Git")
	}
}

func getGitVersion() string {
	out, err := runCommandSilent("git", "--version")
	if err != nil {
		return "unknown"
	}
	// Output: "git version 2.47.1"
	return out
}
