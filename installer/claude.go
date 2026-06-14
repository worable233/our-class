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

	// 构建安装命令：直接使用 --registry 参数，不修改全局 npm 配置
	args := []string{"install", "-g", claudePackage, "--no-audit", "--no-fund", "--registry", npmRegistry}

	printInfo(fmt.Sprintf("  正在安装 %s（使用镜像源加速）...", claudePackage))
	printInfo("  如果安装失败，可手动执行:")
	printInfo(fmt.Sprintf("    npm install -g %s", claudePackage))

	// 在 Unix 上检测权限：npm -g 需要写入 /usr/local 等目录
	if runtime.GOOS != "windows" {
		testDir := "/usr/local/lib/node_modules"
		if _, err := os.Stat(testDir); os.IsNotExist(err) {
			// macOS 常见情况：目录不存在，尝试用 nvm 或用户目录
			printInfo("  检测到全局 node_modules 可能需要管理员权限")
			printInfo("  尝试使用 sudo 安装...")
			sudoArgs := append([]string{"sudo"}, args...)
			if err := runCommand("npm", sudoArgs...); err != nil {
				// sudo 失败，提示手动安装
				exitWithError(fmt.Sprintf(
					"安装失败。请手动执行:\n"+
						"  sudo npm install -g %[1]s\n\n"+
						"  或者使用 nvm 安装 Node.js 后重试:\n"+
						"  npm install -g %[1]s",
					claudePackage))
			}
		} else {
			// 目录存在，直接安装
			if err := runCommand("npm", args...); err != nil {
				if strings.Contains(err.Error(), "EACCES") || strings.Contains(err.Error(), "permission") {
					printInfo("  权限不足，尝试使用 sudo 安装...")
					sudoArgs := append([]string{"sudo"}, args...)
					if err2 := runCommand("npm", sudoArgs...); err2 != nil {
						exitWithError(fmt.Sprintf("安装失败: %v\n请手动执行: sudo npm install -g %s", err2, claudePackage))
					}
				} else {
					exitWithError(fmt.Sprintf("安装失败: %v\n请手动执行: npm install -g %s", err, claudePackage))
				}
			}
		}
	} else {
		// Windows 直接安装
		if err := runCommand("npm", args...); err != nil {
			exitWithError(fmt.Sprintf("安装失败: %v\n请手动执行: npm install -g %s", err, claudePackage))
		}
	}

	printSuccess("Claude Code CLI 安装完成！")

	fmt.Printf("\n")
	termCmd := "claude"
	if runtime.GOOS == "windows" {
		termCmd = "claude.cmd"
	}
	fmt.Printf("  %s使用方式:%s %s\n", ColorBold, ColorReset, termCmd)
	fmt.Printf("  在项目目录中执行上述命令即可开始 AI 编程\n")
}
