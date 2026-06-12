package main

import (
	"os/exec"
	"runtime"
)

// openBrowser opens the given URL in the default browser.
func openBrowser(url string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		printWarning("无法自动打开浏览器，请手动访问: " + url)
		return nil
	}

	if err := cmd.Run(); err != nil {
		printWarning("无法自动打开浏览器，请手动访问: " + url)
		return err
	}
	return nil
}
