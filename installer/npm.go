package main

import (
	"fmt"
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
	// Check current registry first
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

// installDependencies runs npm install in both server/ and root directories.
func installDependencies(projectRoot string) {
	printInfo("安装前端依赖（可能需要 1-3 分钟）...")
	if err := runCommandInDir(projectRoot, "npm", "install", "--registry", npmRegistry); err != nil {
		exitWithError(fmt.Sprintf("前端依赖安装失败: %v", err))
	}
	printSuccess("前端依赖安装完成")

	printInfo("安装后端依赖...")
	serverDir := filepath.Join(projectRoot, "server")
	if err := runCommandInDir(serverDir, "npm", "install", "--registry", npmRegistry); err != nil {
		exitWithError(fmt.Sprintf("后端依赖安装失败: %v", err))
	}
	printSuccess("后端依赖安装完成")
}

// ensurePM2 globally installs PM2 if not already present.
func ensurePM2() {
	if commandExists("pm2") {
		printSuccess("PM2 已安装")
		return
	}

	printInfo("正在安装 PM2...")
	if err := runCommand("npm", "install", "-g", "pm2", "--registry", npmRegistry); err != nil {
		printWarning(fmt.Sprintf("PM2 安装失败: %v", err))
		printInfo("将使用直接启动模式（不支持开机自启）")
		return
	}

	// On Windows, also install pm2-windows-startup for service support
	if runtime.GOOS == "windows" {
		runCommand("npm", "install", "-g", "pm2-windows-startup", "--registry", npmRegistry)
	}

	printSuccess("PM2 安装完成")
}

// buildFrontend runs npm run build-only to build the Vue frontend.
func buildFrontend(projectRoot string) {
	printInfo("正在构建前端（约 30-60 秒）...")
	if err := runCommandInDir(projectRoot, "npm", "run", "build-only"); err != nil {
		exitWithError(fmt.Sprintf("前端构建失败: %v", err))
	}

	// Verify dist/ exists
	distDir := filepath.Join(projectRoot, "dist")
	if _, err := os.Stat(distDir); os.IsNotExist(err) {
		exitWithError("前端构建完成但 dist/ 目录不存在")
	}
	printSuccess("前端构建完成")
}

// startSetupWizard launches the setup wizard server and opens the browser.
func startSetupWizard(projectRoot string, port int) {
	serverDir := filepath.Join(projectRoot, "server")

	// Check npx is available
	if !commandExists("npx") {
		exitWithError("npx 命令不可用，请确保 Node.js 正确安装并在 PATH 中")
	}

	printInfo(fmt.Sprintf("正在启动配置向导（端口 %d）...", port))

	// Start the setup wizard as a background process
	cmd := createBackgroundCommand("npx", "tsx", "src/setup/index.ts")
	cmd.Dir = serverDir

	if err := cmd.Start(); err != nil {
		exitWithError(fmt.Sprintf("配置向导启动失败: %v", err))
	}
	// Release the process so it survives after installer exits
	cmd.Process.Release()

	// Wait for the server to be ready (poll with timeout)
	printInfo("等待服务启动...")
	url := fmt.Sprintf("http://localhost:%d/setup", port)
	if !waitForServer(url, 15) {
		printWarning("服务启动超时，但可能仍在启动中")
	}

	// Open browser
	printInfo(fmt.Sprintf("正在打开浏览器: %s", url))
	openBrowser(url)

	printSuccess("配置向导已启动！")
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

// waitForServer polls the URL until it responds or timeout.
func waitForServer(url string, timeoutSec int) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(time.Duration(timeoutSec) * time.Second)

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			return true
		}
		time.Sleep(500 * time.Millisecond)
	}
	return false
}
