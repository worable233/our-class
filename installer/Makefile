VERSION := 1.0.0
BUILD_DIR := ../dist/installer

.PHONY: all clean windows macos macos-arm linux

all: windows macos macos-arm linux
	@echo ""
	@echo "✅ 编译完成！产出文件:"
	@ls -lh $(BUILD_DIR)/
	@echo ""

windows:
	@echo "🔨 编译 Windows amd64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o $(BUILD_DIR)/ourclass-installer-windows-amd64.exe .

macos:
	@echo "🔨 编译 macOS amd64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o $(BUILD_DIR)/ourclass-installer-darwin-amd64 .

macos-arm:
	@echo "🔨 编译 macOS arm64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o $(BUILD_DIR)/ourclass-installer-darwin-arm64 .

linux:
	@echo "🔨 编译 Linux amd64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o $(BUILD_DIR)/ourclass-installer-linux-amd64 .

clean:
	rm -rf $(BUILD_DIR)

# Development: build and run locally
run:
	go run . --skip-build

# Development: build and run with reset
reset:
	go run . --reset
