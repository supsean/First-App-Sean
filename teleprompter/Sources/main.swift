import AppKit

// MARK: - Settings

enum Settings {
    private static let d = UserDefaults.standard

    static var wpm: Int {
        get { let v = d.integer(forKey: "wpm"); return v == 0 ? 140 : v }
        set { d.set(newValue, forKey: "wpm") }
    }
    static var fontSize: CGFloat {
        get { let v = d.double(forKey: "fontSize"); return v == 0 ? 30 : CGFloat(v) }
        set { d.set(Double(newValue), forKey: "fontSize") }
    }
    static var text: String {
        get { d.string(forKey: "text") ?? "" }
        set { d.set(newValue, forKey: "text") }
    }
}

// MARK: - Window that can take keyboard input while borderless

final class PrompterPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

// MARK: - Drag strip (grab here to move the window)

final class DragStrip: NSView {
    override var mouseDownCanMoveWindow: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        let pill = NSRect(x: bounds.midX - 18, y: bounds.midY - 2, width: 36, height: 4)
        NSColor(white: 1, alpha: 0.18).setFill()
        NSBezierPath(roundedRect: pill, xRadius: 2, yRadius: 2).fill()
    }
}

// MARK: - Small round icon button

final class IconButton: NSButton {
    init(symbol: String, target: AnyObject?, action: Selector, tip: String) {
        super.init(frame: .zero)
        let cfg = NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)
        image = NSImage(systemSymbolName: symbol, accessibilityDescription: tip)?.withSymbolConfiguration(cfg)
        isBordered = false
        bezelStyle = .regularSquare
        contentTintColor = NSColor(white: 1, alpha: 0.75)
        self.target = target
        self.action = action
        toolTip = tip
        translatesAutoresizingMaskIntoConstraints = false
        widthAnchor.constraint(equalToConstant: 28).isActive = true
        heightAnchor.constraint(equalToConstant: 28).isActive = true
    }
    required init?(coder: NSCoder) { fatalError() }

    func setSymbol(_ name: String) {
        let cfg = NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)
        image = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(cfg)
    }
}

// MARK: - Settings popover

final class SettingsViewController: NSViewController {
    var onChange: (() -> Void)?

    private let wpmField = NSTextField()
    private let wpmStepper = NSStepper()
    private let fontSlider = NSSlider(value: 30, minValue: 16, maxValue: 72, target: nil, action: nil)
    private let fontLabel = NSTextField(labelWithString: "")

    override func loadView() {
        let v = NSView(frame: NSRect(x: 0, y: 0, width: 240, height: 120))

        let wpmTitle = NSTextField(labelWithString: "Words per minute")
        wpmTitle.font = .systemFont(ofSize: 12, weight: .medium)

        wpmField.integerValue = Settings.wpm
        wpmField.alignment = .center
        wpmField.target = self
        wpmField.action = #selector(wpmTyped)
        wpmField.translatesAutoresizingMaskIntoConstraints = false
        wpmField.widthAnchor.constraint(equalToConstant: 60).isActive = true
        let fmt = NumberFormatter()
        fmt.minimum = 20; fmt.maximum = 600; fmt.allowsFloats = false
        wpmField.formatter = fmt

        wpmStepper.minValue = 20
        wpmStepper.maxValue = 600
        wpmStepper.increment = 10
        wpmStepper.integerValue = Settings.wpm
        wpmStepper.target = self
        wpmStepper.action = #selector(wpmStepped)

        let wpmRow = NSStackView(views: [wpmTitle, NSView(), wpmField, wpmStepper])
        wpmRow.spacing = 6

        let fontTitle = NSTextField(labelWithString: "Text size")
        fontTitle.font = .systemFont(ofSize: 12, weight: .medium)
        fontSlider.doubleValue = Double(Settings.fontSize)
        fontSlider.target = self
        fontSlider.action = #selector(fontChanged)
        fontLabel.stringValue = "\(Int(Settings.fontSize))"
        fontLabel.alignment = .right
        fontLabel.translatesAutoresizingMaskIntoConstraints = false
        fontLabel.widthAnchor.constraint(equalToConstant: 26).isActive = true

        let fontRow = NSStackView(views: [fontTitle, fontSlider, fontLabel])
        fontRow.spacing = 8

        let stack = NSStackView(views: [wpmRow, fontRow])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 14
        stack.edgeInsets = NSEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        stack.translatesAutoresizingMaskIntoConstraints = false
        v.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: v.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: v.trailingAnchor),
            stack.topAnchor.constraint(equalTo: v.topAnchor),
            stack.bottomAnchor.constraint(equalTo: v.bottomAnchor),
            wpmRow.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -32),
            fontRow.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -32),
        ])
        view = v
    }

    @objc private func wpmTyped() {
        let v = max(20, min(600, wpmField.integerValue))
        Settings.wpm = v
        wpmStepper.integerValue = v
        onChange?()
    }
    @objc private func wpmStepped() {
        Settings.wpm = wpmStepper.integerValue
        wpmField.integerValue = wpmStepper.integerValue
        onChange?()
    }
    @objc private func fontChanged() {
        let s = CGFloat(fontSlider.doubleValue.rounded())
        Settings.fontSize = s
        fontLabel.stringValue = "\(Int(s))"
        onChange?()
    }
}

// MARK: - Main controller

final class PrompterController: NSObject, NSTextViewDelegate {
    let panel: PrompterPanel
    private let scrollView = NSScrollView()
    private let textView = NSTextView()
    private var playButton: IconButton!
    private var popover: NSPopover?

    private var timer: Timer?
    private var lastTick: CFTimeInterval = 0
    private var offset: CGFloat = 0
    private(set) var isPlaying = false

    override init() {
        // 4:3 window, centered at the top of the screen, right under the camera.
        let screen = NSScreen.main ?? NSScreen.screens[0]
        let width: CGFloat = 560
        let height: CGFloat = 420
        let vf = screen.visibleFrame
        let frame = NSRect(x: vf.midX - width / 2, y: vf.maxY - height - 6, width: width, height: height)

        panel = PrompterPanel(contentRect: frame,
                              styleMask: [.borderless, .resizable],
                              backing: .buffered, defer: false)
        super.init()

        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.minSize = NSSize(width: 280, height: 160)
        panel.hidesOnDeactivate = false
        // Keeps the teleprompter out of screen recordings / screen sharing.
        panel.sharingType = .none

        buildUI()
    }

    private func buildUI() {
        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.black.cgColor
        root.layer?.cornerRadius = 14
        root.layer?.masksToBounds = true
        panel.contentView = root

        // Text
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.automaticallyAdjustsContentInsets = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        textView.drawsBackground = false
        textView.textColor = .white
        textView.insertionPointColor = .white
        textView.isRichText = false
        textView.allowsUndo = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.textContainerInset = NSSize(width: 22, height: 18)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        textView.delegate = self
        textView.string = Settings.text
        applyFont()

        scrollView.documentView = textView
        root.addSubview(scrollView)

        let strip = DragStrip()
        strip.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(strip)

        // Controls (bottom-right, subtle)
        playButton = IconButton(symbol: "play.fill", target: self, action: #selector(togglePlay), tip: "Play / Pause (⌘↩)")
        let restart = IconButton(symbol: "arrow.counterclockwise", target: self, action: #selector(restart), tip: "Back to top")
        let gear = IconButton(symbol: "gearshape.fill", target: self, action: #selector(showSettings(_:)), tip: "Settings")

        let controls = NSStackView(views: [restart, playButton, gear])
        controls.spacing = 2
        controls.wantsLayer = true
        controls.layer?.backgroundColor = NSColor(white: 0.12, alpha: 0.9).cgColor
        controls.layer?.cornerRadius = 16
        controls.edgeInsets = NSEdgeInsets(top: 2, left: 6, bottom: 2, right: 6)
        controls.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(controls)

        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            strip.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            strip.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            strip.topAnchor.constraint(equalTo: root.topAnchor),
            strip.heightAnchor.constraint(equalToConstant: 16),
            scrollView.topAnchor.constraint(equalTo: strip.bottomAnchor),
            scrollView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            controls.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -10),
            controls.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -10),
        ])
    }

    private func applyFont() {
        let font = NSFont.systemFont(ofSize: Settings.fontSize, weight: .semibold)
        let para = NSMutableParagraphStyle()
        para.lineHeightMultiple = 1.25
        textView.font = font
        textView.defaultParagraphStyle = para
        textView.typingAttributes = [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: para]
        if let storage = textView.textStorage {
            storage.addAttributes([.font: font, .foregroundColor: NSColor.white, .paragraphStyle: para],
                                  range: NSRange(location: 0, length: storage.length))
        }
    }

    func textDidChange(_ notification: Notification) {
        Settings.text = textView.string
    }

    // MARK: Playback

    private var wordCount: Int {
        textView.string.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count
    }

    private var textHeight: CGFloat {
        guard let lm = textView.layoutManager, let tc = textView.textContainer else { return 0 }
        lm.ensureLayout(for: tc)
        return lm.usedRect(for: tc).height + textView.textContainerInset.height * 2
    }

    /// Pixels per second so the whole script takes (words / wpm) minutes.
    private var speed: CGFloat {
        let words = max(1, wordCount)
        let seconds = Double(words) / Double(Settings.wpm) * 60
        return textHeight / CGFloat(seconds)
    }

    @objc func togglePlay() {
        isPlaying ? pause() : play()
    }

    func play() {
        guard wordCount > 0 else { return }
        if !isPlaying && offset <= 0 {
            scroll(to: 0) // start from the very top
        }
        isPlaying = true
        textView.isEditable = false
        textView.isSelectable = false
        textView.setSelectedRange(NSRange(location: 0, length: 0))
        panel.makeFirstResponder(nil)
        playButton.setSymbol("pause.fill")

        // Let the last line scroll all the way to the top.
        scrollView.contentInsets = NSEdgeInsets(top: 0, left: 0, bottom: scrollView.bounds.height, right: 0)

        lastTick = CACurrentMediaTime()
        timer?.invalidate()
        let t = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func pause() {
        isPlaying = false
        timer?.invalidate()
        timer = nil
        playButton.setSymbol("play.fill")
        textView.isEditable = true
        textView.isSelectable = true
    }

    @objc func restart() {
        let wasPlaying = isPlaying
        pause()
        offset = 0
        scroll(to: 0)
        if wasPlaying { play() }
    }

    private func tick() {
        let now = CACurrentMediaTime()
        let dt = now - lastTick
        lastTick = now
        offset += speed * CGFloat(dt)
        let maxOffset = max(0, textHeight - 20)
        if offset >= maxOffset {
            offset = maxOffset
            scroll(to: offset)
            pause()
            offset = 0 // next play starts from the top again
            return
        }
        scroll(to: offset)
    }

    private func scroll(to y: CGFloat) {
        offset = y
        scrollView.contentView.setBoundsOrigin(NSPoint(x: 0, y: y))
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }

    /// Nudge the position by hand (arrow keys while playing).
    func nudge(_ dy: CGFloat) {
        scroll(to: max(0, offset + dy))
    }

    // MARK: Settings

    @objc func showSettings(_ sender: NSButton) {
        if let p = popover, p.isShown { p.close(); return }
        let vc = SettingsViewController()
        vc.onChange = { [weak self] in self?.applyFont() }
        let p = NSPopover()
        p.contentViewController = vc
        p.behavior = .transient
        p.appearance = NSAppearance(named: .darkAqua)
        p.show(relativeTo: sender.bounds, of: sender, preferredEdge: .maxY)
        popover = p
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    var controller: PrompterController!
    var keyMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        controller = PrompterController()
        controller.panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] e in
            guard let c = self?.controller else { return e }
            let cmd = e.modifierFlags.contains(.command)
            switch e.keyCode {
            case 36 where cmd:             // ⌘↩  play / pause
                c.togglePlay(); return nil
            case 49 where c.isPlaying:     // space while playing  pause
                c.togglePlay(); return nil
            case 53:                       // esc  stop + back to top
                c.restart(); c.pause(); return nil
            case 126 where c.isPlaying:    // ↑
                c.nudge(-40); return nil
            case 125 where c.isPlaying:    // ↓
                c.nudge(40); return nil
            default:
                return e
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Hide Teleprompter", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Teleprompter", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        // Needed so ⌘C / ⌘V / ⌘A / ⌘Z work in the text area.
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
