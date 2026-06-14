package main

import (
	"fmt"
	"os"
	"runtime"
	"strings"
)

const claudePackage = "@anthropic-ai/claude-code"

// installClaudeCode installs Claude Code CLI globally via npm.
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

	printStep(2, 3, "安装 Claude Code CLI")

	args := []string{"install", "-g", claudePackage, "--no-audit", "--no-fund", "--registry", npmRegistry}
	printInfo("正在安装 " + claudePackage + "（使用镜像源加速）...")

	// 统一策略：先尝试直接安装，权限不足再 sudo
	err := runCommand("npm", args...)
	if err != nil {
		errStr := err.Error()
		isPermission := strings.Contains(errStr, "EACCES") || strings.Contains(errStr, "permission") || strings.Contains(errStr, "EPERM")

		if runtime.GOOS != "windows" && isPermission {
			printInfo("权限不足，尝试使用 sudo 安装...")
			sudoArgs := append([]string{"sudo"}, args...)
			err2 := runCommand("npm", sudoArgs...)
			if err2 != nil {
				exitWithError(fmt.Sprintf(
					"安装失败。请手动执行:\n"+
						"  sudo npm install -g %s\n\n"+
						"  或者使用 nvm 管理 Node.js 后重试:\n"+
						"  npm install -g %s",
					claudePackage, claudePackage))
			}
		} else {
			exitWithError(fmt.Sprintf("安装失败: %v\n请手动执行: npm install -g %s", err, claudePackage))
		}
	}

	printSuccess("Claude Code CLI 安装完成！")

	// ── 安装后检查 ─────────────────────────────────────────────────────

	printStep(3, 3, "检查安装结果")

	// 1. 验证命令是否可用
	claudeBin := "claude"
	if runtime.GOOS == "windows" {
		claudeBin = "claude.cmd"
	}

	// 检查命令是否在 PATH 中
	if !commandExists(claudeBin) {
		printWarning(fmt.Sprintf("未在 PATH 中找到 %s", claudeBin))
		printNpmPathHint()
	} else {
		// 获取版本号验证安装成功
		ver, _ := runCommandSilent(claudeBin, "--version")
		if ver != "" {
			printSuccess(fmt.Sprintf("已检测到 Claude Code %s", strings.TrimSpace(ver)))
		} else {
			printSuccess("已检测到 claude 命令")
		}
	}

	fmt.Printf("\n  %s使用方式:%s %s\n", ColorBold, ColorReset, claudeBin)
	fmt.Printf("  在项目目录中执行上述命令即可开始 AI 编程\n")
}

// printNpmPathHint 打印 npm 全局安装路径的环境变量提示
func printNpmPathHint() {
	if runtime.GOOS == "windows" {
		// Windows: %APPDATA%\npm
		appData := os.Getenv("APPDATA")
		npmDir := appData + "\\npm"
		fmt.Printf("\n  %sWindows 需要手动添加 npm 到 PATH:%s\n", ColorYellow, ColorReset)
		fmt.Printf("    %s 将以下路径添加到系统环境变量 PATH 中:\n", ColorGray)
		fmt.Printf("      %s\n", npmDir)
		fmt.Printf("    %s 或者在 PowerShell 中执行:\n", ColorGray)
		fmt.Printf("      [Environment]::SetEnvironmentVariable(\n")
		fmt.Printf("        \"Path\",\n")
		fmt.Printf("        [Environment]::GetEnvironmentVariable(\"Path\",\"Machine\") + \";%s\",\n", npmDir)
		fmt.Printf("        \"Machine\")\n")
		fmt.Printf("    %s 然后重新打开终端即可使用 claude 命令\n", ColorGray)
	} else {
		// Unix: 检查 npm 全局 bin 目录
		npmBin, _ := runCommandSilent("npm", "bin", "-g")
		if npmBin != "" {
			fmt.Printf("\n  %s需要将 npm 全局 bin 目录添加到 PATH:%s\n", ColorYellow, ColorReset)
			fmt.Printf("    %s 在 ~/.bashrc 或 ~/.zshrc 中添加:\n", ColorGray)
			fmt.Printf("      export PATH=\"%s:$PATH\"\n", npmBin)
			fmt.Printf("    %s 然后执行: source ~/.zshrc\n", ColorGray)
		}
	}
}
