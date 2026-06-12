package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// ensureProject clones the repo if needed, or pulls latest if already exists.
// Returns the project root path.
func ensureProject(existingRoot string) string {
	// Already in project directory — just pull latest
	if existingRoot != "" {
		printInfo("检测到项目目录，拉取最新代码...")
		if err := gitPull(existingRoot); err != nil {
			printWarning(fmt.Sprintf("拉取失败（可能有本地修改），继续使用当前版本: %v", err))
		} else {
			printSuccess("代码已更新到最新版本")
		}
		return existingRoot
	}

	// Not in project — need to clone
	dest := chooseCloneDir()

	// Check if directory already exists
	if _, err := os.Stat(filepath.Join(dest, ".git")); err == nil {
		printInfo("检测到已有项目目录，拉取最新代码...")
		if err := gitPull(dest); err != nil {
			printWarning(fmt.Sprintf("拉取失败，继续使用现有版本: %v", err))
		} else {
			printSuccess("代码已更新到最新版本")
		}
		return dest
	}

	// Clone fresh
	printInfo(fmt.Sprintf("正在克隆项目到: %s", dest))
	if err := gitClone(dest); err != nil {
		exitWithError(fmt.Sprintf("克隆失败: %v", err))
	}
	printSuccess("项目克隆完成")
	return dest
}

// chooseCloneDir picks the best directory to clone into.
func chooseCloneDir() string {
	home, _ := os.UserHomeDir()

	switch runtime.GOOS {
	case "windows":
		// Prefer Desktop, fallback to home
		desktop := filepath.Join(home, "Desktop")
		if dirExists(desktop) {
			return filepath.Join(desktop, repoName)
		}
		return filepath.Join(home, repoName)
	case "darwin":
		desktop := filepath.Join(home, "Desktop")
		if dirExists(desktop) {
			return filepath.Join(desktop, repoName)
		}
		return filepath.Join(home, repoName)
	case "linux":
		homeDir := filepath.Join(home, repoName)
		return homeDir
	default:
		return filepath.Join(home, repoName)
	}
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// gitClone clones the repository. Tries mirror first, falls back to original.
func gitClone(dest string) error {
	// Remove partial clone if exists
	os.RemoveAll(dest)

	printInfo("尝试国内镜像加速...")
	if err := runCommand("git", "clone", "--depth=1", repoMirrorURL, dest); err != nil {
		printInfo("镜像失败，尝试原始地址...")
		if err2 := runCommand("git", "clone", "--depth=1", repoURL, dest); err2 != nil {
			return fmt.Errorf("git clone 失败: %w", err2)
		}
	}
	return nil
}

// gitPull pulls the latest changes in the given directory.
func gitPull(dir string) error {
	// Stash any local changes first
	runCommandSilentInDir(dir, "git", "stash")

	if _, err := runCommandSilentInDir(dir, "git", "pull", "--ff-only"); err != nil {
		return fmt.Errorf("git pull 失败: %w", err)
	}
	return nil
}
