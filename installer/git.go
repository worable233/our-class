package main

import (
	"fmt"
	"os"
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
	// Use MinGit — small (~15MB), no admin required, just unzip
	url := "https://mirrors.ustc.edu.cn/github-release/git-for-windows/git/LatestRelease/MinGit-2.54.0-64-bit.zip"
	filename := "MinGit-2.54.0-64-bit.zip"

	tmpFile := filepath.Join(os.TempDir(), filename)
	if err := downloadFile(url, tmpFile); err != nil {
		// Fallback: npmmirror
		url = "https://npmmirror.com/mirrors/git-for-windows/LatestRelease/" + filename
		if err2 := downloadFile(url, tmpFile); err2 != nil {
			exitWithError(fmt.Sprintf("下载 Git 失败: %v", err2))
		}
	}
	defer os.Remove(tmpFile)

	// Extract to user-local directory (no admin needed)
	homeDir, _ := os.UserHomeDir()
	installDir := filepath.Join(homeDir, ".ourclass", "git")
	os.MkdirAll(installDir, 0755)

	printInfo("正在解压 Git...")
	if err := extractZip(tmpFile, installDir); err != nil {
		exitWithError(fmt.Sprintf("解压 Git 失败: %v", err))
	}

	// Find the MinGit root directory (contains cmd/ and mingw64/)
	minGitRoot := findMinGitRoot(installDir)
	if minGitRoot == "" {
		exitWithError("Git 解压后找不到目录结构")
	}

	// Add BOTH cmd/ and mingw64/bin/ to PATH — git.exe needs both
	cmdDir := filepath.Join(minGitRoot, "cmd")
	mingwDir := filepath.Join(minGitRoot, "mingw64", "bin")
	pathSep := string(os.PathListSeparator)

	newPath := cmdDir + pathSep + mingwDir + pathSep + os.Getenv("PATH")
	os.Setenv("PATH", newPath)

	// Also set GIT_EXEC_PATH so git can find its subcommands
	os.Setenv("GIT_EXEC_PATH", mingwDir)

	printInfo(fmt.Sprintf("已安装到 %s", minGitRoot))
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
	runCommand("xcode-select", "--install")

	// Wait up to 3s for git to appear (if already installed but not in PATH)
	for i := 0; i < 10; i++ {
		if commandExists("git") {
			return
		}
		sleep(300)
	}

	// Xcode CLT takes 5-10 minutes — can't wait that long
	printWarning("Xcode CLT 安装需要较长时间（5-10 分钟）")
	printInfo("请等待安装完成后重新运行此程序")
	exitWithError("Git 未安装完成，请等待 Xcode CLT 安装后重试")
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
	return out
}

// findMinGitRoot finds the MinGit root directory inside the extracted folder.
func findMinGitRoot(baseDir string) string {
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		if entry.IsDir() {
			// Check if this directory has cmd/git.exe
			candidate := filepath.Join(baseDir, entry.Name())
			if _, err := os.Stat(filepath.Join(candidate, "cmd", "git.exe")); err == nil {
				return candidate
			}
		}
	}
	return ""
}
