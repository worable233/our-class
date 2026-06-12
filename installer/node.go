package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	nodeVersion    = "v22.14.0"
	nodeMirrorBase = "https://npmmirror.com/mirrors/node/"
)

// ensureNode checks for Node.js >= 18 and installs if missing.
func ensureNode() string {
	version := getNodeVersion()
	if version != "" {
		major := parseMajorVersion(version)
		if major >= 18 {
			printSuccess(fmt.Sprintf("Node.js %s 已安装", version))
			return version
		}
		printWarning(fmt.Sprintf("Node.js %s 版本过低，需要 >= 18", version))
	}

	printInfo("正在安装 Node.js " + nodeVersion + "...")

	switch runtime.GOOS {
	case "windows":
		return installNodeWindows()
	case "darwin":
		return installNodeMacOS()
	case "linux":
		return installNodeLinux()
	default:
		exitWithError(fmt.Sprintf("不支持的操作系统: %s", runtime.GOOS))
		return ""
	}
}

func installNodeWindows() string {
	arch := "x64"
	if runtime.GOARCH == "arm64" {
		arch = "arm64"
	}

	// Use zip instead of msi — no admin required
	filename := fmt.Sprintf("node-%s-win-%s.zip", nodeVersion, arch)
	url := nodeMirrorBase + nodeVersion + "/" + filename

	tmpFile := filepath.Join(os.TempDir(), filename)
	if err := downloadFile(url, tmpFile); err != nil {
		exitWithError(fmt.Sprintf("下载 Node.js 失败: %v", err))
	}
	defer os.Remove(tmpFile)

	// Extract to user-local directory (no admin needed)
	homeDir, _ := os.UserHomeDir()
	installDir := filepath.Join(homeDir, ".ourclass", "node")
	os.MkdirAll(installDir, 0755)

	printInfo("正在解压 Node.js...")
	if err := extractZip(tmpFile, installDir); err != nil {
		exitWithError(fmt.Sprintf("解压 Node.js 失败: %v", err))
	}

	// The zip contains a folder like node-v22.14.0-win-x64
	// We need to add the inner bin dir to PATH for this session
	innerDir := filepath.Join(installDir, filename[:len(filename)-4])
	nodeBin := innerDir // node.exe is at the root of the extracted folder

	// Add to PATH for current process
	os.Setenv("PATH", nodeBin+";"+os.Getenv("PATH"))

	// Verify
	version := getNodeVersion()
	if version == "" {
		exitWithError("Node.js 安装后无法检测到，请重启终端后重试")
	}

	// Persist PATH suggestion
	printWarning(fmt.Sprintf("已安装到 %s", innerDir))
	printInfo("建议将以下路径添加到系统 PATH 环境变量:")
	printInfo(fmt.Sprintf("  %s", nodeBin))

	printSuccess(fmt.Sprintf("Node.js %s 安装完成", version))
	return version
}

func installNodeMacOS() string {
	// Try Homebrew first
	if commandExists("brew") {
		printInfo("使用 Homebrew 安装 Node.js...")
		if err := runCommand("brew", "install", "node"); err != nil {
			printWarning("Homebrew 安装失败，尝试直接下载...")
			return installNodeMacOSDirect()
		}
		version := getNodeVersion()
		printSuccess(fmt.Sprintf("Node.js %s 安装完成", version))
		return version
	}

	return installNodeMacOSDirect()
}

func installNodeMacOSDirect() string {
	arch := "x64"
	if runtime.GOARCH == "arm64" {
		arch = "arm64"
	}
	filename := fmt.Sprintf("node-%s-darwin-%s.tar.gz", nodeVersion, arch)
	url := nodeMirrorBase + nodeVersion + "/" + filename

	tmpFile := filepath.Join(os.TempDir(), filename)
	if err := downloadFile(url, tmpFile); err != nil {
		exitWithError(fmt.Sprintf("下载 Node.js 失败: %v", err))
	}
	defer os.Remove(tmpFile)

	printInfo("正在解压 Node.js...")
	if err := extractTarGz(tmpFile, "/usr/local"); err != nil {
		homeDir, _ := os.UserHomeDir()
		localDir := filepath.Join(homeDir, ".local")
		os.MkdirAll(localDir, 0755)
		if err2 := extractTarGz(tmpFile, localDir); err2 != nil {
			exitWithError(fmt.Sprintf("解压 Node.js 失败: %v", err2))
		}
		printWarning(fmt.Sprintf("已安装到 %s，请确保 %s/bin 在 PATH 中", localDir, localDir))
	}

	version := getNodeVersion()
	if version == "" {
		exitWithError("Node.js 安装后无法检测到，请重启终端后重试")
	}
	printSuccess(fmt.Sprintf("Node.js %s 安装完成", version))
	return version
}

func installNodeLinux() string {
	// Detect package manager
	if commandExists("apt") {
		printInfo("使用 apt 安装 Node.js...")
		if err := runAptInstall(); err == nil {
			version := getNodeVersion()
			printSuccess(fmt.Sprintf("Node.js %s 安装完成", version))
			return version
		}
		printWarning("apt 安装失败，尝试直接下载...")
	} else if commandExists("yum") {
		printInfo("使用 yum 安装 Node.js...")
		if err := runYumInstall(); err == nil {
			version := getNodeVersion()
			printSuccess(fmt.Sprintf("Node.js %s 安装完成", version))
			return version
		}
		printWarning("yum 安装失败，尝试直接下载...")
	}

	return installNodeLinuxDirect()
}

func runAptInstall() error {
	if err := runCommand("curl", "-fsSL", "https://deb.nodesource.com/setup_22.x", "-o", "/tmp/nodesource_setup.sh"); err != nil {
		return err
	}
	if err := runCommand("sudo", "bash", "/tmp/nodesource_setup.sh"); err != nil {
		return err
	}
	return runCommand("sudo", "apt-get", "install", "-y", "nodejs")
}

func runYumInstall() error {
	if err := runCommand("curl", "-fsSL", "https://rpm.nodesource.com/setup_22.x", "-o", "/tmp/nodesource_setup.sh"); err != nil {
		return err
	}
	if err := runCommand("sudo", "bash", "/tmp/nodesource_setup.sh"); err != nil {
		return err
	}
	return runCommand("sudo", "yum", "install", "-y", "nodejs")
}

func installNodeLinuxDirect() string {
	arch := "x64"
	if runtime.GOARCH == "arm64" {
		arch = "arm64"
	}
	filename := fmt.Sprintf("node-%s-linux-%s.tar.xz", nodeVersion, arch)
	url := nodeMirrorBase + nodeVersion + "/" + filename

	tmpFile := filepath.Join(os.TempDir(), filename)
	if err := downloadFile(url, tmpFile); err != nil {
		exitWithError(fmt.Sprintf("下载 Node.js 失败: %v", err))
	}
	defer os.Remove(tmpFile)

	printInfo("正在解压 Node.js...")
	// Use system tar which handles .tar.xz natively
	if err := runCommand("tar", "-xJf", tmpFile, "-C", "/usr/local", "--strip-components=1"); err != nil {
		homeDir, _ := os.UserHomeDir()
		localDir := filepath.Join(homeDir, ".local")
		os.MkdirAll(localDir, 0755)
		if err2 := runCommand("tar", "-xJf", tmpFile, "-C", localDir, "--strip-components=1"); err2 != nil {
			exitWithError(fmt.Sprintf("解压 Node.js 失败: %v", err2))
		}
		printWarning(fmt.Sprintf("已安装到 %s，请确保 %s/bin 在 PATH 中", localDir, localDir))
	}

	version := getNodeVersion()
	if version == "" {
		exitWithError("Node.js 安装后无法检测到，请重启终端后重试")
	}
	printSuccess(fmt.Sprintf("Node.js %s 安装完成", version))
	return version
}

// downloadFile downloads a URL to a local file with progress display.
func downloadFile(url string, dest string) error {
	printInfo(fmt.Sprintf("下载: %s", url))

	client := &http.Client{
		// No timeout for large files
	}

	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("HTTP 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}

	out, err := os.Create(dest)
	if err != nil {
		return fmt.Errorf("创建文件失败: %w", err)
	}
	defer out.Close()

	total := resp.ContentLength
	written := int64(0)
	buf := make([]byte, 32*1024)
	lastPct := -1

	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			nw, writeErr := out.Write(buf[:n])
			if writeErr != nil {
				return writeErr
			}
			written += int64(nw)
			if total > 0 {
				pct := int(float64(written) / float64(total) * 100)
				if pct != lastPct {
					lastPct = pct
					fmt.Printf("\r  %s下载进度: %d%% (%d MB / %d MB)%s",
						ColorCyan, pct, written/1024/1024, total/1024/1024, ColorReset)
				}
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}

	fmt.Println()
	return nil
}

// extractTarGz extracts a .tar.gz file to the destination directory.
func extractTarGz(src string, dest string) error {
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	return extractTar(gz, dest)
}

// extractTar extracts a tar stream to the destination directory.
func extractTar(r io.Reader, dest string) error {
	tr := tar.NewReader(r)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		// Sanitize path to prevent zip-slip attacks
		target := filepath.Join(dest, header.Name)
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(dest)+string(os.PathSeparator)) {
			return fmt.Errorf("invalid path: %s", header.Name)
		}

		switch header.Typeflag {
		case tar.TypeDir:
			os.MkdirAll(target, 0755)
		case tar.TypeReg:
			os.MkdirAll(filepath.Dir(target), 0755)
			outFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(outFile, tr); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()
		}
	}
	return nil
}

// parseMajorVersion extracts the major version number from "v22.14.0"
func parseMajorVersion(v string) int {
	v = strings.TrimPrefix(v, "v")
	parts := strings.Split(v, ".")
	if len(parts) == 0 {
		return 0
	}
	major := 0
	for _, c := range parts[0] {
		if c >= '0' && c <= '9' {
			major = major*10 + int(c-'0')
		}
	}
	return major
}
