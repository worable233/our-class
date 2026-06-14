package main

import (
	"fmt"
	"os"
	"runtime"
	"strings"
)

const claudePackage = "@anthropic-ai/claude-code"

// installClaudeCode installs Claude Code CLI globally via npm.
// 目标：安装后用户可在终端直接执行 claude 命令，零额外操作。
func installClaudeCode() {
	printBanner()
	fmt.Println()
	printStep(1, 3, "检查 Node.js 环境")

	nodeVer := getNodeVersion()
	if nodeVer == "" {
		exitWithError("未检测到 Node.js，请先安装 Node.js ≥ 18 后重试")
	}
	major := parseMajorVersion(nodeVer)
	if major < 18 {
		exitWithError(fmt.Sprintf("Node.js 版本过低（%s），请升级到 ≥ 18", nodeVer))
	}
	printSuccess(fmt.Sprintf("Node.js %s 已安装", nodeVer))

	// ── 安装 ──────────────────────────────────────────────────────────

	printStep(2, 3, "安装 Claude Code CLI")
	printInfo("正在安装 " + claudePackage + " ...")

	// 先试试镜像源，如果失败切到官方源
	args := []string{"install", "-g", claudePackage, "--no-audit", "--no-fund"}
	argsMirror := append(append([]string{}, args...), "--registry", npmRegistry)

	err := runCommand("npm", argsMirror...)
	if err != nil {
		printInfo("镜像源安装失败，尝试官方源...")
		err = runCommand("npm", args...)
	}
	if err != nil {
		// Unix 权限不足则 sudo 重试
		errStr := err.Error()
		isPermission := strings.Contains(errStr, "EACCES") || strings.Contains(errStr, "permission") || strings.Contains(errStr, "EPERM")

		if runtime.GOOS != "windows" && isPermission {
			printInfo("权限不足，尝试使用 sudo 安装...")
			sudoArgs := append([]string{"sudo"}, argsMirror...)
			err2 := runCommand("npm", sudoArgs...)
			if err2 != nil {
				exitWithError(fmt.Sprintf(
					"安装失败。请手动执行:\n"+
						"  sudo npm install -g %s\n\n"+
						"  或使用 nvm 安装 Node.js 后:\n"+
						"  npm install -g %s",
					claudePackage, claudePackage))
			}
		} else {
			exitWithError(fmt.Sprintf(
				"安装失败: %v\n请手动执行: npm install -g %s",
				err, claudePackage))
		}
	}
	printSuccess(claudePackage + " 安装完成")

	// ── 安装后环境修复 ─────────────────────────────────────────────

	printStep(3, 3, "配置环境变量")

	// 获取 npm 全局 bin 目录（例如 Windows: %APPDATA%\npm, Unix: /usr/local/bin）
	npmBin, _ := runCommandSilent("npm", "bin", "-g")
	npmBin = strings.TrimSpace(npmBin)
	if npmBin == "" {
		// 如果 npm bin -g 失败，根据系统猜测
		if runtime.GOOS == "windows" {
			npmBin = os.Getenv("APPDATA") + "\\npm"
		} else {
			npmBin = "/usr/local/bin"
		}
	}

	// 确认二进制文件物理存在
	claudeBin := "claude"
	if runtime.GOOS == "windows" {
		claudeBin = "claude.cmd"
	}
	binaryPath := npmBin + string(os.PathSeparator) + claudeBin
	if _, statErr := os.Stat(binaryPath); statErr != nil {
		// 尝试在可能的位置查找
		found := findClaudeBinary(npmBin)
		if found == "" {
			printWarning("未找到 claude 可执行文件，请检查 npm 安装是否成功")
			printNpmPathHint(npmBin)
			return
		}
		binaryPath = found
		// 更新 npmBin 为实际目录
		npmBin = binaryPath[:len(binaryPath)-len(claudeBin)-1]
	}

	printInfo(fmt.Sprintf("检测到安装位置: %s", binaryPath))

	// 确保 PATH 中包含 npm bin 目录，并刷新当前进程的 PATH
	pathFixed := ensureNpmBinInPath(npmBin)

	// 最终验证：直接运行 claude --version
	if pathFixed || commandExists(claudeBin) {
		ver, err := runCommandSilent(claudeBin, "--version")
		if err == nil && ver != "" {
			printSuccess(fmt.Sprintf("Claude Code %s 已就绪", strings.TrimSpace(ver)))
			fmt.Printf("\n  %s使用方式:%s %s\n", ColorBold, ColorReset, claudeBin)
			fmt.Printf("  在终端执行 claude 即可开始 AI 编程\n")
			return
		}
	}

	// 兜底：用绝对路径测试
	ver, err := runCommandSilent(binaryPath, "--version")
	if err == nil && ver != "" {
		printSuccess(fmt.Sprintf("Claude Code %s 已安装", strings.TrimSpace(ver)))
		printInfo("请重新打开终端后使用 claude 命令")
		fmt.Printf("\n  %s使用方式:%s %s\n", ColorBold, ColorReset, binaryPath)
		return
	}

	printWarning("安装完成但验证失败，可能需要手动配置")
	printNpmPathHint(npmBin)
}

// ensureNpmBinInPath 确保 npmBin 在 PATH 中，返回是否成功修复。
// 在 Windows 上会自动写入用户级 PATH 并刷新当前进程。
func ensureNpmBinInPath(npmBin string) bool {
	if npmBin == "" {
		return false
	}

	currentPath := os.Getenv("PATH")

	// 检查是否已经在 PATH 中（大小写不敏感）
	pathUpper := strings.ToUpper(currentPath)
	binUpper := strings.ToUpper(npmBin)
	if strings.Contains(pathUpper, binUpper) {
		return true // 已经在 PATH 中
	}

	if runtime.GOOS == "windows" {
		// Windows: 写入用户级 PATH 并刷新当前进程
		printInfo("正在将 npm 添加到系统 PATH ...")

		// 1. 写入用户环境变量（setx 只影响新进程）
		setxCmd := fmt.Sprintf(`setx PATH "%s;%s"`, npmBin, currentPath)
		runCommandSilent("cmd", "/c", setxCmd)

		// 2. 立即刷新当前进程的 PATH
		newPath := currentPath + ";" + npmBin
		os.Setenv("PATH", newPath)

		// 3. 验证是否生效
		checkPath := os.Getenv("PATH")
		if strings.Contains(strings.ToUpper(checkPath), strings.ToUpper(npmBin)) {
			printSuccess("已添加到 PATH，当前会话已生效")
			return true
		}
		printWarning("添加 PATH 失败，请手动配置")
		return false
	}

	// Unix: 检测 SHELL 类型并给出配置建议
	shell := os.Getenv("SHELL")
	var rcFile string
	switch {
	case strings.Contains(shell, "zsh"):
		rcFile = "~/.zshrc"
	case strings.Contains(shell, "bash"):
		rcFile = "~/.bashrc"
	default:
		rcFile = "~/.profile"
	}

	fmt.Printf("\n  %s请将以下内容添加到 %s:%s\n", ColorYellow, rcFile, ColorReset)
	fmt.Printf("    export PATH=\"%s:$PATH\"\n", npmBin)
	fmt.Printf("  %s然后执行: source %s%s\n", ColorGray, rcFile, ColorReset)

	// 虽然没写入文件，但本次进程加上 PATH 以便后续验证
	os.Setenv("PATH", currentPath+":"+npmBin)
	return false
}

// findClaudeBinary 在可能的位置查找 claude 可执行文件。
func findClaudeBinary(hintDir string) string {
	candidates := []string{
		hintDir,
		os.Getenv("APPDATA") + "\\npm",
		"/usr/local/bin",
		"/usr/bin",
		os.Getenv("HOME") + "/.npm-global/bin",
	}

	claudeBin := "claude"
	if runtime.GOOS == "windows" {
		claudeBin = "claude.cmd"
	}

	for _, dir := range candidates {
		if dir == "" {
			continue
		}
		path := dir + string(os.PathSeparator) + claudeBin
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

// printNpmPathHint 打印手动配置提示。
func printNpmPathHint(npmBin string) {
	if npmBin == "" {
		if runtime.GOOS == "windows" {
			npmBin = os.Getenv("APPDATA") + "\\npm"
		} else {
			npmBin = "/usr/local/bin"
		}
	}

	if runtime.GOOS == "windows" {
		fmt.Printf("\n  %s请手动将以下路径添加到系统环境变量 PATH:%s\n", ColorYellow, ColorReset)
		fmt.Printf("    %s\n", npmBin)
		fmt.Printf("  %sPowerShell 中执行:%s\n", ColorGray, ColorReset)
		fmt.Printf("    [Environment]::SetEnvironmentVariable(\n")
		fmt.Printf("      \"Path\",\n")
		fmt.Printf("      [Environment]::GetEnvironmentVariable(\"Path\",\"User\") + \";%s\",\n", npmBin)
		fmt.Printf("      \"User\")\n")
		fmt.Printf("  然后重新打开终端即可。\n")
	} else {
		fmt.Printf("\n  %s请将以下内容添加到 shell 配置文件:%s\n", ColorYellow, ColorReset)
		fmt.Printf("    export PATH=\"%s:$PATH\"\n", npmBin)
		fmt.Printf("  然后执行: source ~/.zshrc\n")
	}
}
