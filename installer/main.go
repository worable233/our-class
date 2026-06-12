package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

const defaultPort = 3001

func main() {
	// Ensure "press any key to exit" on Windows
	if runtime.GOOS == "windows" {
		defer pressAnyKey()
	}

	// Parse command line arguments
	skipBuild := flag.Bool("skip-build", false, "跳过前端构建（开发模式）")
	port := flag.Int("port", defaultPort, "配置向导端口")
	reset := flag.Bool("reset", false, "重置项目到初始状态")
	flag.Parse()

	// Get project root: prefer CWD (user should run from project root)
	cwd, err := os.Getwd()
	if err != nil {
		exitWithError(fmt.Sprintf("获取当前目录失败: %v", err))
	}

	// Detect if we're inside the installer/ subdirectory
	projectRoot := cwd
	if filepath.Base(cwd) == "installer" {
		projectRoot = filepath.Dir(cwd)
	}

	// Verify this looks like the project root (check for package.json)
	if _, err := os.Stat(filepath.Join(projectRoot, "package.json")); os.IsNotExist(err) {
		exitWithError(fmt.Sprintf(
			"未在当前目录找到 package.json，请在 OurClass 项目根目录下运行此程序。\n当前目录: %s", cwd))
	}

	// Handle reset mode
	if *reset {
		resetProject(projectRoot)
		return
	}

	// Normal installation flow
	printBanner()

	fmt.Printf("\n  %s系统:%s %s/%s\n", ColorGray, ColorReset, runtime.GOOS, runtime.GOARCH)
	fmt.Printf("  %s路径:%s %s\n", ColorGray, ColorReset, projectRoot)

	// Step 1: Check/Install Node.js
	printStep(1, 5, "检查 Node.js 环境")
	ensureNode()

	// Step 2: Set npm registry
	printStep(2, 5, "配置 npm 镜像源")
	ensureNpmRegistry()

	// Step 3: Install dependencies
	printStep(3, 5, "安装项目依赖")
	installDependencies(projectRoot)

	// Step 4: Build frontend (optional)
	if !*skipBuild {
		printStep(4, 5, "构建前端")
		buildFrontend(projectRoot)
	} else {
		printStep(4, 5, "构建前端（已跳过）")
		printInfo("使用 --skip-build 跳过了前端构建")
	}

	// Step 5: Install PM2 and start setup wizard
	printStep(5, 5, "安装 PM2 并启动配置向导")
	ensurePM2()
	startSetupWizard(projectRoot, *port)

	fmt.Printf("\n%s  🎉 安装完成！%s\n", ColorGreen, ColorReset)
	fmt.Println("  请在浏览器中完成配置向导。")
	fmt.Println("  按任意键退出...")
	waitForInput()
}
