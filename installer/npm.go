package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

const npmRegistry = "https://registry.npmmirror.com"

// sleep pauses execution for the specified milliseconds.
func sleep(ms int) {
	time.Sleep(time.Duration(ms) * time.Millisecond)
}

// ensureNpmRegistry sets the npm registry to npmmirror for faster downloads in China.
func ensureNpmRegistry() {
	current, _ := runCommandSilent("npm", "config", "get", "registry")
	if current == npmRegistry {
		printSuccess("npm 镜像源已设置为 npmmirror")
		return
	}

	printInfo("设置 npm 镜像源（将修改全局 npm 配置）...")
	if err := runCommand("npm", "config", "set", "registry", npmRegistry); err != nil {
		printWarning(fmt.Sprintf("设置 npm 镜像失败: %v", err))
		printInfo("将使用 --registry 参数替代")
	} else {
		printSuccess("npm 镜像源已设置为 npmmirror")
	}
}

// npmFlags returns common flags to speed up npm operations.
func npmFlags() []string {
	return []string{
		"--registry", npmRegistry,
		"--no-audit", // Skip security audit
		"--no-fund",  // Skip funding messages
	}
}

// installDependencies runs npm install in both server/ and root directories.
func installDependencies(projectRoot string) {
	serverDir := filepath.Join(projectRoot, "server")

	installDir(projectRoot, "前端")
	installDir(serverDir, "后端")
}

// installDir installs dependencies for a single directory.
func installDir(dir string, label string) {
	modulesDir := filepath.Join(dir, "node_modules")
	lockFile := filepath.Join(dir, "package-lock.json")

	// If node_modules exists and is newer than lockfile, skip entirely
	if dirExists(modulesDir) && isUpToDate(modulesDir, lockFile) {
		printSuccess(fmt.Sprintf("%s依赖已是最新，跳过", label))
		return
	}

	if dirExists(modulesDir) {
		printInfo(fmt.Sprintf("%s依赖已存在，增量更新...", label))
		args := append([]string{"install"}, npmFlags()...)
		if err := runCommandInDir(dir, "npm", args...); err != nil {
			exitWithError(fmt.Sprintf("%s依赖更新失败: %v", label, err))
		}
	} else {
		printInfo(fmt.Sprintf("首次安装%s依赖...", label))
		args := append([]string{"ci"}, npmFlags()...)
		if err := runCommandInDir(dir, "npm", args...); err != nil {
			exitWithError(fmt.Sprintf("%s依赖安装失败: %v", label, err))
		}
	}
	printSuccess(fmt.Sprintf("%s依赖完成", label))
}

// isUpToDate checks if node_modules is newer than package-lock.json.
// If so, dependencies haven't changed and we can skip npm install.
func isUpToDate(modulesDir string, lockFile string) bool {
	modInfo, err := os.Stat(modulesDir)
	if err != nil {
		return false
	}
	lockInfo, err := os.Stat(lockFile)
	if err != nil {
		return false
	}
	return modInfo.ModTime().After(lockInfo.ModTime())
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}


// buildFrontend runs npm run build-only to build the Vue frontend.
func buildFrontend(projectRoot string) {
	printInfo("正在构建前端（约 30-60 秒）...")
	if err := runCommandInDir(projectRoot, "npm", "run", "build-only"); err != nil {
		exitWithError(fmt.Sprintf("前端构建失败: %v", err))
	}

	distDir := filepath.Join(projectRoot, "dist")
	if _, err := os.Stat(distDir); os.IsNotExist(err) {
		exitWithError("前端构建完成但 dist/ 目录不存在")
	}
	printSuccess("前端构建完成")
}

// startSetupWizard launches the setup wizard server and opens the browser.
func startSetupWizard(projectRoot string, port int) {
	serverDir := filepath.Join(projectRoot, "server")

	if !commandExists("npx") {
		exitWithError("npx 命令不可用，请确保 Node.js 正确安装并在 PATH 中")
	}

	printInfo(fmt.Sprintf("正在启动配置向导（端口 %d）...", port))

	// Use local tsx directly (faster than npx which has lookup overhead)
	tsxPath := filepath.Join(serverDir, "node_modules", ".bin", "tsx")
	if runtime.GOOS == "windows" {
		tsxPath += ".cmd"
	}

	var cmd *exec.Cmd
	if fileExists(tsxPath) {
		cmd = createBackgroundCommand(tsxPath, "src/setup/index.ts")
	} else {
		cmd = createBackgroundCommand("npx", "tsx", "src/setup/index.ts")
	}
	cmd.Dir = serverDir

	if err := cmd.Start(); err != nil {
		exitWithError(fmt.Sprintf("配置向导启动失败: %v", err))
	}
	cmd.Process.Release()

	url := fmt.Sprintf("http://localhost:%d/setup", port)

	// Quick check: wait 3s, then open browser regardless
	printInfo("等待服务启动...")
	ready := waitForServer(url, 3)

	// Open browser regardless — page will load once server is up
	printInfo(fmt.Sprintf("正在打开浏览器: %s", url))
	openBrowser(url)

	if ready {
		printSuccess("配置向导已启动！")
	} else {
		printSuccess("配置向导启动中，浏览器页面将自动加载...")
	}

	fmt.Printf("\n  %s╔══════════════════════════════════════╗%s\n", ColorGreen, ColorReset)
	fmt.Printf("  %s║  浏览器应该已自动打开配置页面        ║%s\n", ColorGreen, ColorReset)
	fmt.Printf("  %s║  如果没有，请手动访问:               ║%s\n", ColorGreen, ColorReset)
	fmt.Printf("  %s║  %-36s║%s\n", ColorGreen, url, ColorReset)
	fmt.Printf("  %s╚══════════════════════════════════════╝%s\n", ColorGreen, ColorReset)
}

// createBackgroundCommand creates a command suitable for background execution.
func createBackgroundCommand(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	setPlatformAttributes(cmd)
	return cmd
}

// waitForServer polls the URL until it responds or timeout (3s default).
func waitForServer(url string, timeoutSec int) bool {
	client := &http.Client{
		Timeout: 2 * time.Second,
	}
	deadline := time.Now().Add(time.Duration(timeoutSec) * time.Second)

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			return true
		}
		time.Sleep(300 * time.Millisecond)
	}
	return false
}

// httpClient returns an HTTP client with 3s connection timeout.
// Used for all network requests to avoid hanging on slow networks.
func httpClient() *http.Client {
	return &http.Client{
		Timeout: 0, // No total timeout (large files need time)
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   3 * time.Second, // Connection timeout
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout:   3 * time.Second,
			ResponseHeaderTimeout: 3 * time.Second,
		},
	}
}
