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

func init() {
	flag.Usage = func() {
		fmt.Println()
		fmt.Printf("  %sOurClass 安装程序 - 使用说明%s\n", ColorBold, ColorReset)
		fmt.Println()
		fmt.Println("  命令:")
		fmt.Println("    （无参数）           安装 OurClass（默认）")
		fmt.Println("    -h, --help           显示此帮助")
		fmt.Println("    -u, --uninstall      卸载 OurClass（清除所有数据）")
		fmt.Println("    -r, --reset          重置项目到初始状态")
		fmt.Println("    -c, --claude         安装 Claude Code CLI（AI 编程助手）")
		fmt.Println("    -s, --skip-build     跳过前端构建（开发模式）")
		fmt.Println("    -p, --port <端口>    配置向导端口（默认 3001）")
		fmt.Println()
		fmt.Println("  示例:")
		fmt.Println("    ourclass-installer")
		fmt.Println("    ourclass-installer -u")
		fmt.Println("    ourclass-installer -c")
		fmt.Println("    ourclass-installer --skip-build")
		fmt.Println()
	}
}

func main() {
	// Always wait before exit — prevents terminal window from closing immediately
	// on double-click (Windows cmd, macOS Finder, Linux file manager)
	defer waitForExit()

	// 注册命令行参数
	var (
		skipBuild bool
		port      = defaultPort
		reset     bool
		uninstall bool
		claude    bool
	)
	flag.BoolVar(&skipBuild, "skip-build", false, "")
	flag.BoolVar(&skipBuild, "s", false, "")
	flag.IntVar(&port, "port", defaultPort, "")
	flag.IntVar(&port, "p", defaultPort, "")
	flag.BoolVar(&reset, "reset", false, "")
	flag.BoolVar(&reset, "r", false, "")
	flag.BoolVar(&uninstall, "uninstall", false, "")
	flag.BoolVar(&uninstall, "u", false, "")
	flag.BoolVar(&claude, "claude", false, "")
	flag.BoolVar(&claude, "c", false, "")
	flag.Parse()

	// 检查未知的命令行参数（不允许位置参数）
	if args := flag.Args(); len(args) > 0 {
		fmt.Printf("\n  %s❌ 未知命令: %s%s\n", ColorRed, strings.Join(args, " "), ColorReset)
		fmt.Printf("  %s请使用 -h 或 --help 查看所有命令%s\n\n", ColorYellow, ColorReset)
		os.Exit(1)
	}

	// Resolve project root
	projectRoot := resolveProjectRoot()

	// Handle Claude Code install (highest priority — no project needed)
	if claude {
		installClaudeCode()
		return
	}

	// Handle uninstall mode (check before reset — uninstall takes precedence)
	if uninstall {
		uninstallProject(projectRoot)
		return
	}

	// Handle reset mode
	if reset {
		if projectRoot == "" {
			exitWithError("未找到 OurClass 项目目录，请在项目目录下运行，或先执行安装")
		}
		resetProject(projectRoot)
		return
	}

	// Normal installation flow
	printBanner()

	printInfo(fmt.Sprintf("系统: %s/%s    路径: %s", runtime.GOOS, runtime.GOARCH, projectRoot))

	// Step 1: Check/Install Git + Node.js in parallel
	printStep(1, 5, "检查环境（Git + Node.js 并行检测）")
	ensureGitAndNode()

	// Step 2: Clone or update project
	printStep(2, 5, "获取项目代码")
	projectRoot = ensureProject(projectRoot)
	saveProjectPath(projectRoot)

	// Step 3: Set npm registry + install dependencies
	printStep(3, 5, "安装项目依赖")
	ensureNpmRegistry()
	installDependencies(projectRoot)

	// Step 4: Build frontend (optional)
	if !skipBuild {
		printStep(4, 5, "构建前端")
		printStep(4, 5, "构建前端（已跳过）")
		printInfo("使用 --skip-build 跳过了前端构建")
	}

	// Step 5: Start setup wizard
	printStep(5, 5, "启动配置向导")
	startSetupWizard(projectRoot, port)

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
