package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// ensureProject clones the repo if needed, or pulls latest if already exists.
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

	// Check if directory already exists and is a git repo
	if isGitRepo(dest) {
		printInfo("检测到已有项目目录，拉取最新代码...")
		if err := gitPull(dest); err != nil {
			printWarning(fmt.Sprintf("拉取失败，继续使用现有版本: %v", err))
		} else {
			printSuccess("代码已更新到最新版本")
		}
		return dest
	}

	// If directory exists but is NOT a git repo, warn and ask
	if dirExists(dest) {
		printWarning(fmt.Sprintf("目录 %s 已存在但不是 git 仓库", dest))
		if !promptYesNo("是否删除并重新克隆？") {
			exitWithError("已取消")
		}
		os.RemoveAll(dest)
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
		// Try localized Desktop names (Chinese Windows uses 桌面)
		for _, name := range []string{"Desktop", "桌面"} {
			desktop := filepath.Join(home, name)
			if dirExists(desktop) {
				return filepath.Join(desktop, repoName)
			}
		}
		return filepath.Join(home, repoName)
	case "darwin":
		desktop := filepath.Join(home, "Desktop")
		if dirExists(desktop) {
			return filepath.Join(desktop, repoName)
		}
		return filepath.Join(home, repoName)
	default:
		return filepath.Join(home, repoName)
	}
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func isGitRepo(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil
}

// gitClone clones the repository. Tries mirror first, falls back to original.
func gitClone(dest string) error {
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

	// Try ff-only first, fall back to rebase if it fails
	if _, err := runCommandSilentInDir(dir, "git", "pull", "--ff-only"); err != nil {
		printInfo("快速合并失败，尝试 rebase...")
		if _, err2 := runCommandSilentInDir(dir, "git", "pull", "--rebase"); err2 != nil {
			return fmt.Errorf("git pull 失败: %w", err2)
		}
	}
	return nil
}
