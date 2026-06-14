package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// resetProject resets the project to a fresh-install state and reinstalls.
func resetProject(projectRoot string) {
	printBanner()
	fmt.Printf("\n%s  ⚠️  即将重置 OurClass 项目到初始状态%s\n", ColorYellow, ColorReset)
	fmt.Println("  这将删除以下内容:")
	fmt.Println("    - 数据库 (server/data.db)")
	fmt.Println("    - 环境配置 (server/.env)")
	fmt.Println("    - 向导状态 (server/src/setup/setup-state.json)")
	fmt.Println("    - 上传文件 (server/uploads/)")
	fmt.Println("    - 存储文件 (server/storage/)")
	fmt.Println("    - 构建产物 (dist/)")
	fmt.Println()
	fmt.Println("  然后将自动拉取最新代码、安装依赖、构建前端、启动向导。")

	if !promptYesNo("  确认继续？") {
		fmt.Println("  已取消")
		return
	}

	// Step 1: Stop running processes
	printStep(1, 5, "停止服务")
	stopProcesses(projectRoot)

	// Step 2: Delete files and directories
	printStep(2, 5, "清理数据")
	filesToDelete := []string{
		filepath.Join(projectRoot, "server", "data.db"),
		filepath.Join(projectRoot, "server", "data.db-shm"),
		filepath.Join(projectRoot, "server", "data.db-wal"),
		filepath.Join(projectRoot, "server", ".env"),
		filepath.Join(projectRoot, "server", "src", "setup", "setup-state.json"),
	}

	dirsToClean := []string{
		filepath.Join(projectRoot, "server", "uploads"),
		filepath.Join(projectRoot, "server", "storage"),
		filepath.Join(projectRoot, "dist"), // 清理旧构建产物，避免 Windows 文件锁定
	}

	for _, f := range filesToDelete {
		if err := os.Remove(f); err != nil && !os.IsNotExist(err) {
			printWarning(fmt.Sprintf("删除 %s 失败: %v", filepath.Base(f), err))
		}
	}

	for _, d := range dirsToClean {
		if err := os.RemoveAll(d); err != nil && !os.IsNotExist(err) {
			printWarning(fmt.Sprintf("清理 %s 失败: %v", filepath.Base(d), err))
		}
		os.MkdirAll(d, 0755)
	}
	printSuccess("数据已清理")

	// Step 3: Pull latest code
	printStep(3, 5, "拉取最新代码")
	if err := gitPull(projectRoot); err != nil {
		printWarning(fmt.Sprintf("拉取失败（可能有本地修改），继续使用当前版本: %v", err))
	} else {
		printSuccess("代码已更新到最新版本")
	}

	// Step 4: Install dependencies
	printStep(4, 5, "安装依赖")
	ensureNpmRegistry()

	// Clean npm cache to fix corrupted .mjs files on Windows
	printInfo("清理 npm 缓存...")
	runCommandSilent("npm", "cache", "clean", "--force")

	installDependencies(projectRoot)

	// Step 5: Build frontend and start setup wizard
	printStep(5, 5, "构建前端并启动向导")
	buildFrontend(projectRoot)
	startSetupWizard(projectRoot, 3001)
}

// stopProcesses stops any running OurClass processes.
func stopProcesses(projectRoot string) {
	printInfo("正在停止运行中的服务...")

	// Try PM2 first (if user installed it manually)
	if commandExists("pm2") {
		runCommandSilent("pm2", "delete", "ourclass")
	}

	// Kill processes on ports 3000 and 3001
	killPortProcess(3000)
	killPortProcess(3001)

	printSuccess("服务已停止")
}

// killPortProcess kills the process listening on the specified port.
func killPortProcess(port int) {
	switch runtime.GOOS {
	case "windows":
		killPortWindows(port)
	case "darwin", "linux":
		killPortUnix(port)
	}
}

func killPortWindows(port int) {
	// Use netstat to find the specific PID listening on the port
	out, err := runCommandSilent("netstat", "-ano")
	if err != nil {
		return
	}

	// Parse output: look for "LISTENING" on our port
	target := fmt.Sprintf(":%d", port)
	lines := strings.Split(out, "\n")
	for _, line := range lines {
		if strings.Contains(line, target) && strings.Contains(line, "LISTENING") {
			// Extract PID (last column)
			fields := strings.Fields(line)
			if len(fields) >= 5 {
				pid := fields[len(fields)-1]
				if pid != "0" {
					printInfo(fmt.Sprintf("  终止端口 %d 上的进程 PID %s", port, pid))
					runCommandSilent("taskkill", "/F", "/PID", pid)
				}
			}
		}
	}
}

func killPortUnix(port int) {
	pid, err := runCommandSilent("lsof", "-ti", fmt.Sprintf(":%d", port))
	if err != nil || pid == "" {
		return
	}
	// pid might contain multiple PIDs separated by newlines
	for _, p := range strings.Split(pid, "\n") {
		p = strings.TrimSpace(p)
		if p != "" {
			printInfo(fmt.Sprintf("  终止端口 %d 上的进程 PID %s", port, p))
			runCommandSilent("kill", "-9", p)
		}
	}
}
