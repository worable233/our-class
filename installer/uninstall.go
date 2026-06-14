package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// uninstallProject removes OurClass completely.
func uninstallProject(projectRoot string) {
	ShowIntro()
	fmt.Printf("\n%s  ⚠️  即将卸载 OurClass%s\n", ColorYellow, ColorReset)
	fmt.Println("  这将删除以下内容:")
	fmt.Println("    - 项目所有文件（代码、数据库、配置）")
	fmt.Println("    - 上传和存储的文件")
	fmt.Println("    - 项目路径记录")
	if projectRoot != "" {
		fmt.Printf("\n  项目路径: %s\n", projectRoot)
	}
	fmt.Println()
	fmt.Println("  ⚠️  注意: 此操作不可撤销！")

	if !promptYesNo("  确认卸载？") {
		fmt.Println("  已取消")
		return
	}

	// Step 1: Stop running processes
	printStep(1, 3, "停止运行中的服务")
	if projectRoot != "" {
		stopProcesses(projectRoot)
	}
	printSuccess("服务已停止")

	// Step 2: Remove project directory
	printStep(2, 3, "删除项目文件")
	if projectRoot != "" {
		printInfo(fmt.Sprintf("  删除目录: %s", projectRoot))
		if err := os.RemoveAll(projectRoot); err != nil {
			printWarning(fmt.Sprintf("  删除项目目录失败: %v", err))
			printInfo("  请手动删除项目目录")
		} else {
			printSuccess("项目文件已删除")
		}
	} else {
		printInfo("  未找到项目目录，跳过")
	}

	// Step 3: Clean up saved path
	printStep(3, 3, "清理配置记录")
	removeSavedConfig()
	printSuccess("配置记录已清理")

	fmt.Printf("\n%s  ✅ OurClass 已成功卸载！%s\n", ColorGreen, ColorReset)
	fmt.Println("  如有需要，可重新运行安装程序再次安装。")
}

// removeSavedConfig removes the saved path and other configuration files.
func removeSavedConfig() {
	home, err := os.UserHomeDir()
	if err != nil {
		printWarning(fmt.Sprintf("  获取用户目录失败: %v", err))
		return
	}

	configDir := filepath.Join(home, ".ourclass")
	if _, err := os.Stat(configDir); os.IsNotExist(err) {
		printInfo("  未找到配置记录，跳过")
		return
	}

	if err := os.RemoveAll(configDir); err != nil {
		printWarning(fmt.Sprintf("  删除配置目录失败: %v", err))
		return
	}
}
