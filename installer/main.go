package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

const (
	defaultPort   = 3001
	repoURL       = "https://github.com/worable233/our-class.git"
	repoMirrorURL = "https://github.chenc.dev/github.com/worable233/our-class"
	repoName      = "our-class"
)

func main() {
	if runtime.GOOS == "windows" {
		defer pressAnyKey()
	}

	// Parse command line arguments
	skipBuild := flag.Bool("skip-build", false, "跳过前端构建（开发模式）")
	port := flag.Int("port", defaultPort, "配置向导端口")
	reset := flag.Bool("reset", false, "重置项目到初始状态")
	flag.Parse()

	// Resolve project root
	projectRoot := resolveProjectRoot()

	// Handle reset mode
	if *reset {
		resetProject(projectRoot)
		return
	}

	// Normal installation flow
	printBanner()

	fmt.Printf("\n  %s系统:%s %s/%s\n", ColorGray, ColorReset, runtime.GOOS, runtime.GOARCH)
	fmt.Printf("  %s路径:%s %s\n", ColorGray, ColorReset, projectRoot)

	// Step 1: Clone or update project
	printStep(1, 6, "获取项目代码")
	projectRoot = ensureProject(projectRoot)

	// Step 2: Check/Install Node.js
	printStep(2, 6, "检查 Node.js 环境")
	ensureNode()

	// Step 3: Set npm registry
	printStep(3, 6, "配置 npm 镜像源")
	ensureNpmRegistry()

	// Step 4: Install dependencies
	printStep(4, 6, "安装项目依赖")
	installDependencies(projectRoot)

	// Step 5: Build frontend (optional)
	if !*skipBuild {
		printStep(5, 6, "构建前端")
		buildFrontend(projectRoot)
	} else {
		printStep(5, 6, "构建前端（已跳过）")
		printInfo("使用 --skip-build 跳过了前端构建")
	}

	// Step 6: Install PM2 and start setup wizard
	printStep(6, 6, "安装 PM2 并启动配置向导")
	ensurePM2()
	startSetupWizard(projectRoot, *port)

	fmt.Printf("\n%s  🎉 安装完成！%s\n", ColorGreen, ColorReset)
	fmt.Println("  请在浏览器中完成配置向导。")
	fmt.Println("  按任意键退出...")
	waitForInput()
}

// resolveProjectRoot determines the project root directory.
// If run from within the project, use that. Otherwise return empty string
// (will be resolved by ensureProject).
func resolveProjectRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}

	// Check if CWD is the project root
	if isProjectRoot(cwd) {
		return cwd
	}

	// Check if we're in installer/ subdirectory
	parent := filepath.Dir(cwd)
	if filepath.Base(cwd) == "installer" && isProjectRoot(parent) {
		return parent
	}

	// Not in project — will need to clone
	return ""
}

func isProjectRoot(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "package.json"))
	return err == nil
}
