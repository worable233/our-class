package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	defaultPort   = 3001
	repoURL       = "https://github.com/worable233/our-class.git"
	repoMirrorURL = "https://github.chenc.dev/github.com/worable233/our-class"
	repoName      = "our-class"
)

func main() {
	// Always wait before exit — prevents terminal window from closing immediately
	// on double-click (Windows cmd, macOS Finder, Linux file manager)
	defer waitForExit()

	// Parse command line arguments
	skipBuild := flag.Bool("skip-build", false, "跳过前端构建（开发模式）")
	port := flag.Int("port", defaultPort, "配置向导端口")
	reset := flag.Bool("reset", false, "重置项目到初始状态")
	resetShort := flag.Bool("r", false, "重置项目到初始状态（等同 --reset）")
	uninstall := flag.Bool("uninstall", false, "卸载 OurClass（清除所有数据）")
	uninstallShort := flag.Bool("u", false, "卸载 OurClass（等同 --uninstall）")
	claude := flag.Bool("claude", false, "安装 Claude Code CLI（AI 编程助手）")
	flag.Parse()

	// Merge short flags
	*reset = *reset || *resetShort
	*uninstall = *uninstall || *uninstallShort

	// Resolve project root
	projectRoot := resolveProjectRoot()

	// Handle Claude Code install (highest priority — no project needed)
	if *claude {
		installClaudeCode()
		return
	}

	// Handle uninstall mode (check before reset — uninstall takes precedence)
	if *uninstall {
		uninstallProject(projectRoot)
		return
	}

	// Handle reset mode
	if *reset {
		if projectRoot == "" {
			exitWithError("未找到 OurClass 项目目录，请在项目目录下运行，或先执行安装")
		}
		resetProject(projectRoot)
		return
	}

	// Normal installation flow
	printBanner()

	fmt.Printf("\n  %s系统:%s %s/%s\n", ColorGray, ColorReset, runtime.GOOS, runtime.GOARCH)
	if projectRoot != "" {
		fmt.Printf("  %s路径:%s %s\n", ColorGray, ColorReset, projectRoot)
	} else {
		fmt.Printf("  %s路径:%s 将自动克隆到桌面\n", ColorGray, ColorReset)
	}

	// Step 1: Check/Install Git + Node.js in parallel
	printStep(1, 5, "检查环境（Git + Node.js 并行检测）")
	ensureGitAndNode()

	// Step 2: Clone or update project
	printStep(2, 5, "获取项目代码")
	projectRoot = ensureProject(projectRoot)
	saveProjectPath(projectRoot) // Remember path for reset

	// Step 3: Set npm registry + install dependencies
	printStep(3, 5, "安装项目依赖")
	ensureNpmRegistry()
	installDependencies(projectRoot)

	// Step 4: Build frontend (optional)
	if !*skipBuild {
		printStep(4, 5, "构建前端")
		buildFrontend(projectRoot)
	} else {
		printStep(4, 5, "构建前端（已跳过）")
		printInfo("使用 --skip-build 跳过了前端构建")
	}

	// Step 5: Start setup wizard
	printStep(5, 5, "启动配置向导")
	startSetupWizard(projectRoot, *port)

	fmt.Printf("\n%s  🎉 安装完成！%s\n", ColorGreen, ColorReset)
	fmt.Println("  请在浏览器中完成配置向导。")
}

// resolveProjectRoot determines the project root directory.
// Order: CWD → installer dir → saved path → home
func resolveProjectRoot() string {
	// 1. Check CWD
	cwd, err := os.Getwd()
	if err == nil {
		if isProjectRoot(cwd) {
			return cwd
		}
		parent := filepath.Dir(cwd)
		if filepath.Base(cwd) == "installer" && isProjectRoot(parent) {
			return parent
		}
	}

	// 2. Check installer's directory
	execPath, err := os.Executable()
	if err == nil {
		execDir := filepath.Dir(execPath)
		if isProjectRoot(filepath.Join(execDir, repoName)) {
			return filepath.Join(execDir, repoName)
		}
		// Also check if installer is inside the project
		if isProjectRoot(execDir) {
			return execDir
		}
	}

	// 3. Check saved path from previous installation
	saved := loadSavedPath()
	if saved != "" && isProjectRoot(saved) {
		return saved
	}

	// 4. Search home directory
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, repoName),
		filepath.Join(home, "Desktop", repoName),
		filepath.Join(home, "桌面", repoName),
	}
	for _, dir := range candidates {
		if isProjectRoot(dir) {
			return dir
		}
	}

	// Not found — will need to clone
	return ""
}

// saveProjectPath saves the project path for future reset operations.
func saveProjectPath(path string) {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".ourclass")
	os.MkdirAll(dir, 0755)
	os.WriteFile(filepath.Join(dir, "install-path.txt"), []byte(path), 0644)
}

// loadSavedPath loads the saved project path.
func loadSavedPath() string {
	home, _ := os.UserHomeDir()
	data, err := os.ReadFile(filepath.Join(home, ".ourclass", "install-path.txt"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func isProjectRoot(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "package.json"))
	return err == nil
}

// ensureGitAndNode checks/installs Git and Node.js concurrently.
func ensureGitAndNode() {
	errCh := make(chan error, 2)

	go func() {
		errCh <- func() error {
			if commandExists("git") {
				printSuccess(fmt.Sprintf("Git %s 已安装", getGitVersion()))
				return nil
			}
			return installGitForParallel()
		}()
	}()

	go func() {
		errCh <- func() error {
			version := getNodeVersion()
			if version != "" && parseMajorVersion(version) >= 18 {
				printSuccess(fmt.Sprintf("Node.js %s 已安装", version))
				return nil
			}
			return installNodeForParallel()
		}()
	}()

	for i := 0; i < 2; i++ {
		if err := <-errCh; err != nil {
			exitWithError(err.Error())
		}
	}
}
