package main

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ── Styles ─────────────────────────────────────────────────────────────

var (
	styleTitle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#7c6ff0"))
	styleStep    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#5b8def"))
	styleSuccess = lipgloss.NewStyle().Foreground(lipgloss.Color("#36d399"))
	styleInfo    = lipgloss.NewStyle().Foreground(lipgloss.Color("#8a8a9a"))
	styleError   = lipgloss.NewStyle().Foreground(lipgloss.Color("#f472b6"))
	styleBox     = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#5b8def")).
			Padding(0, 2)
)

// ── Meteor ─────────────────────────────────────────────────────────────

type meteor struct {
	x, y    float64
	life    int
	maxLife int
}

// ── Model ──────────────────────────────────────────────────────────────

type StatusCallback struct {
	SetStep func(int, string)
	Log     func(string)
	Done    func(error)
}

type tickMsg struct{}
type statusMsg struct {
	step int
	text string
}
type logLineMsg struct{ text string }
type doneMsg struct{ err error }

type model struct {
	width, height int
	step          int
	totalSteps    int
	status        string
	logs          []string
	meteors       []meteor
	frame         int
	done          bool
	hasError      bool
	quitting      bool
}

func newModel(total int) model {
	m := model{
		totalSteps: total,
		status:     "初始化中...",
		meteors:    make([]meteor, 12),
	}
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	for i := range m.meteors {
		m.meteors[i] = randomMeteor(rng, 80, 24)
	}
	return m
}

func randomMeteor(rng *rand.Rand, w, h int) meteor {
	return meteor{
		x:       float64(rng.Intn(w + 30) - 15),
		y:       float64(rng.Intn(h)),
		maxLife: 8 + rng.Intn(18),
	}
}

// ── Bubbletea ──────────────────────────────────────────────────────────

func (m model) Init() tea.Cmd {
	return func() tea.Msg { return tickMsg{} }
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		if m.quitting {
			return m, tea.Quit
		}
		return m, nil

	case tickMsg:
		m.frame++
		rng := rand.New(rand.NewSource(int64(m.frame * 7)))
		w := max(m.width, 80)
		h := max(m.height, 24)
		for i := range m.meteors {
			m.meteors[i].life++
			if m.meteors[i].life > m.meteors[i].maxLife {
				m.meteors[i] = randomMeteor(rng, w, h)
			}
		}
		return m, func() tea.Msg { return tickMsg{} }

	case statusMsg:
		if msg.step > 0 {
			m.step = msg.step
		}
		m.status = msg.text
		return m, nil

	case logLineMsg:
		m.logs = append(m.logs, msg.text)
		if len(m.logs) > 30 {
			m.logs = m.logs[len(m.logs)-30:]
		}
		return m, nil

	case doneMsg:
		m.done = true
		m.quitting = true
		if msg.err != nil {
			m.hasError = true
			m.status = fmt.Sprintf("失败: %v", msg.err)
		} else {
			m.status = "✅ 安装完成！按任意键退出"
		}
		return m, nil
	}
	return m, nil
}

func (m model) View() string {
	w := max(m.width, 80)
	h := max(m.height, 10)

	// 背景画布
	bg := make([][]rune, h)
	for y := range bg {
		bg[y] = make([]rune, w)
		for x := range bg[y] {
			bg[y][x] = ' '
		}
	}

	// 背景繁星
	rng := rand.New(rand.NewSource(int64(m.frame / 2)))
	for i := 0; i < 20; i++ {
		sx := rng.Intn(w)
		sy := rng.Intn(h / 2)
		if sy >= 0 && sy < h && sx >= 0 && sx < w {
			bg[sy][sx] = '·'
		}
	}

	// 流星绘制
	for _, s := range m.meteors {
		if s.life > s.maxLife {
			continue
		}
		prog := float64(s.life) / float64(s.maxLife)
		hx := int(s.x + prog*14)
		hy := int(s.y + prog*3)
		if hy >= 0 && hy < h && hx >= 0 && hx < w {
			bg[hy][hx] = '✦'
			for t := 1; t <= 3; t++ {
				tx := hx - t
				ty := hy - t/2
				if ty >= 0 && ty < h && tx >= 0 && tx < w && bg[ty][tx] == ' ' {
					bg[ty][tx] = '·'
				}
			}
		}
	}

	// 渲染背景
	bgOut := make([]string, h)
	for y := range bg {
		bgOut[y] = string(bg[y])
	}

	// 内容面板（居中）
	boxW := min(w-6, 70)
	boxX := (w - boxW) / 2
	boxY := h/2 - 3
	if boxY < 1 {
		boxY = 1
	}

	// 构建面板内容
	var content string
	content += styleTitle.Render(centerText("OurClass 安装程序", boxW)) + "\n"
	content += styleInfo.Render(centerText("班级管理系统一键部署", boxW)) + "\n\n"

	if m.step > 0 {
		stepText := fmt.Sprintf("  [%d/%d] %s", m.step, m.totalSteps, m.status)
		content += styleStep.Render(stepText) + "\n"
	} else {
		content += styleInfo.Render("  初始化中...") + "\n"
	}

	// 日志窗（显示最近 4 条）
	if !m.done && len(m.logs) > 0 {
		start := len(m.logs) - 4
		if start < 0 {
			start = 0
		}
		for _, l := range m.logs[start:] {
			content += styleInfo.Render("  " + l) + "\n"
		}
	}

	if m.done {
		content += "\n"
		if m.hasError {
			content += styleError.Render("  "+m.status) + "\n"
		} else {
			content += styleSuccess.Render("  "+m.status) + "\n"
		}
	}

	content = content[:len(content)-1] // 去掉末尾换行
	panel := styleBox.Width(boxW).Render(content)

	// 合并背景和面板
	out := ""
	panelLines := splitLines(panel)
	panelH := len(panelLines)

	for y := 0; y < h; y++ {
		line := bgOut[y]
		if y >= boxY && y < boxY+panelH {
			py := y - boxY
			// 将面板行叠加到背景上
			for x := 0; x < len(panelLines[py]) && boxX+x < w; x++ {
				b := []rune(line)
				if boxX+x < len(b) {
					b[boxX+x] = rune(panelLines[py][x])
					line = string(b)
				}
			}
		}
		out += line + "\r\n"
	}
	return out
}

// ── Helpers ────────────────────────────────────────────────────────────

func centerText(s string, w int) string {
	if len(s) >= w {
		return s
	}
	l := (w - len(s)) / 2
	r := w - len(s) - l
	return fmt.Sprintf("%s%s%s", spaces(l), s, spaces(r))
}

func spaces(n int) string {
	if n <= 0 {
		return ""
	}
	return fmt.Sprintf("%*s", n, "")
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i, c := range s {
		if c == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	lines = append(lines, s[start:])
	return lines
}

// ── Public API ─────────────────────────────────────────────────────────

// RunTUI 运行安装程序的 TUI，installFn 在后台 goroutine 中执行。
// installFn 接收 StatusCallback 用于上报进度。
func RunTUI(totalSteps int, installFn func(cb StatusCallback) error) error {
	m := newModel(totalSteps)
	p := tea.NewProgram(m, tea.WithAltScreen())

	// 安装完成后退出 TUI
	cb := StatusCallback{
		SetStep: func(n int, text string) { p.Send(statusMsg{n, text}) },
		Log:     func(text string) { p.Send(logLineMsg{text}) },
		Done:    func(err error) { p.Send(doneMsg{err}) },
	}

	go func() {
		err := installFn(cb)
		cb.Done(err)
	}()

	_, err := p.Run()
	return err
}
