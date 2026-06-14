package main

import (
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// ── Spinner ─────────────────────────────────────────────────────────────

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// Spin shows a spinner alongside a message until done receives a value.
// Usage:
//
//	done := make(chan struct{})
//	go Spin("安装中...", done)
//	// ... long operation ...
//	close(done)
func Spin(msg string, done chan struct{}) {
	i := 0
	for {
		select {
		case <-done:
			fmt.Printf("\r  %s✅ %s%s     \n", ColorGreen, msg, ColorReset)
			return
		default:
			frame := spinnerFrames[i%len(spinnerFrames)]
			fmt.Printf("\r  %s%s%s %s%s", ColorCyan, frame, ColorReset, msg, ColorReset)
			i++
			time.Sleep(80 * time.Millisecond)
		}
	}
}

// ── Shooting Stars Intro ────────────────────────────────────────────────

type meteor struct {
	x, y    int
	life    int
	maxLife int
}

// ShowIntro plays a meteor-shower animation for ~2 seconds, then clears.
func ShowIntro() {
	width, height := terminalSize()
	if width < 40 || height < 5 {
		// 终端太小，跳过动画
		printBanner()
		return
	}

	// 隐藏光标
	fmt.Print("\033[?25l")
	defer fmt.Print("\033[?25h") // 恢复光标

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	stars := make([]meteor, 10)
	for i := range stars {
		stars[i] = randomStar(rng, width, height)
	}

	title := "✦ OurClass 安装程序 ✦"
	subtitle := "班级管理系统一键部署"

	start := time.Now()
	for time.Since(start) < 2*time.Second {
		// 绘制帧
		frame := make([][]rune, height)
		for y := range frame {
			frame[y] = []rune(strings.Repeat(" ", width))
		}

		// 更新并绘制所有流星
		for i := range stars {
			s := &stars[i]
			s.life++
			if s.life > s.maxLife {
				stars[i] = randomStar(rng, width, height)
				continue
			}

			// 流星头部
			progress := float64(s.life) / float64(s.maxLife)
			headX := s.x + int(progress*12)
			headY := s.y + int(progress*3)

			if headX >= 0 && headX < width && headY >= 0 && headY < height {
				frame[headY][headX] = '✦'
				// 发光尾部
				for t := 1; t <= 4; t++ {
					tx := headX - t
					ty := headY - t/2
					if tx >= 0 && tx < width && ty >= 0 && ty < height {
						brightness := 1.0 - float64(t)/5.0
						if brightness > 0.3 {
							frame[ty][tx] = '·'
						}
					}
				}
			}
		}

		// 添加背景星星（小点闪烁）
		for i := 0; i < 15; i++ {
			bx := int(rng.Int63n(int64(width)))
			by := int(rng.Int63n(int64(height)))
			if bx >= 0 && bx < width && by >= 0 && by < height && frame[by][bx] == ' ' {
				frame[by][bx] = '·'
			}
		}

		// 渲染到终端
		var sb strings.Builder
		sb.WriteString("\033[H") // 光标回到左上角
		for y := 0; y < height; y++ {
			line := string(frame[y])

			// 标题行（居中）
			if y == height/3 {
				padding := (width - len(title)) / 2
				if padding < 0 {
					padding = 0
				}
				line = padCenter(title, width, ' ')
			}
			// 副标题
			if y == height/3+2 {
				padding := (width - len(subtitle)) / 2
				if padding < 0 {
					padding = 0
				}
				line = padCenter(ColorGray+subtitle+ColorReset, width, ' ')
			}

			sb.WriteString(line)
			if y < height-1 {
				sb.WriteString("\n")
			}
		}
		fmt.Print(sb.String())
		time.Sleep(50 * time.Millisecond)
	}

	// 清屏回到正常输出
	fmt.Print("\033[H\033[J")
	printBanner()
}

// ── Helpers ─────────────────────────────────────────────────────────────

func terminalSize() (int, int) {
	width, height := 80, 24

	// 尝试读取终端大小（通过 stty 或 tput）
	out, err := runCommandSilent("stty", "size")
	if err == nil {
		var w, h int
		if n, _ := fmt.Sscanf(out, "%d %d", &h, &w); n == 2 {
			if w > 10 {
				width = w
			}
			if h > 3 {
				height = h
			}
		}
	}
	return width, height
}

func randomStar(rng *rand.Rand, width, height int) meteor {
	return meteor{
		x:       rng.Intn(width + 20) - 10,
		y:       rng.Intn(height),
		life:    0,
		maxLife: 5 + rng.Intn(12),
	}
}

func padCenter(s string, width int, pad rune) string {
	visibleLen := visibleLength(s)
	if visibleLen >= width {
		return s
	}
	left := (width - visibleLen) / 2
	right := width - visibleLen - left
	return strings.Repeat(string(pad), left) + s + strings.Repeat(string(pad), right)
}

func visibleLength(s string) int {
	// 简单处理：去除 ANSI 转义码后计算长度
	clean := s
	for _, prefix := range []string{ColorReset, ColorRed, ColorGreen, ColorYellow, ColorBlue, ColorCyan, ColorGray, ColorBold} {
		clean = strings.ReplaceAll(clean, prefix, "")
	}
	return len(clean)
}
