import AppKit
import QuartzCore
import AVFoundation

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

// MARK: - Camera recorder

final class Recorder: NSObject, AVCaptureFileOutputRecordingDelegate {
    let session = AVCaptureSession()
    private let output = AVCaptureMovieFileOutput()
    private let queue = DispatchQueue(label: "teleprompter.recorder")
    private var configured = false
    private(set) var isRecording = false

    var onStarted: (() -> Void)?
    var onFinished: ((URL?) -> Void)?

    /// Asks for camera + mic access, then turns the camera on.
    func startCamera(_ done: @escaping (Bool) -> Void) {
        AVCaptureDevice.requestAccess(for: .video) { videoOK in
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                guard videoOK else { DispatchQueue.main.async { done(false) }; return }
                self.queue.async {
                    if !self.configured { self.configure() }
                    if self.configured && !self.session.isRunning { self.session.startRunning() }
                    let ok = self.configured
                    DispatchQueue.main.async { done(ok) }
                }
            }
        }
    }

    func stopCamera() {
        queue.async {
            if !self.output.isRecording && self.session.isRunning { self.session.stopRunning() }
        }
    }

    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .high
        guard let cam = AVCaptureDevice.default(for: .video),
              let camInput = try? AVCaptureDeviceInput(device: cam),
              session.canAddInput(camInput) else {
            session.commitConfiguration()
            return
        }
        session.addInput(camInput)
        if let mic = AVCaptureDevice.default(for: .audio),
           let micInput = try? AVCaptureDeviceInput(device: mic),
           session.canAddInput(micInput) {
            session.addInput(micInput)
        }
        if session.canAddOutput(output) { session.addOutput(output) }
        session.commitConfiguration()
        configured = true
    }

    func startRecording() {
        let url = Recorder.newFileURL()
        isRecording = true
        queue.async { self.output.startRecording(to: url, recordingDelegate: self) }
    }

    func stopRecording() {
        queue.async { if self.output.isRecording { self.output.stopRecording() } }
    }

    /// ~/Movies/Teleprompter/Take 2026-11-25 at 14.03.22.mov
    static func newFileURL() -> URL {
        let base = FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Teleprompter", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        return base.appendingPathComponent("Take \(f.string(from: Date())).mov")
    }

    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        DispatchQueue.main.async { self.onStarted?() }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                    from connections: [AVCaptureConnection], error: Error?) {
        var ok = error == nil
        if let e = error as NSError?,
           let finished = e.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool {
            ok = finished
        }
        DispatchQueue.main.async {
            self.isRecording = false
            self.onFinished?(ok ? outputFileURL : nil)
        }
    }
}

// MARK: - Main controller

final class PrompterController: NSObject, NSTextViewDelegate {
    let panel: PrompterPanel
    private let scrollView: NSScrollView = NSTextView.scrollableTextView()
    private var textView: NSTextView { scrollView.documentView as! NSTextView }
    private var playButton: IconButton!
    private var recordButton: IconButton!
    private var cameraButton: IconButton!
    private var popover: NSPopover?

    // Camera
    private let recorder = Recorder()
    private let previewView = NSView()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private var previewPinned = false          // turned on with the camera button
    private let countdownLabel = NSTextField(labelWithString: "")
    private let recBadge = NSTextField(labelWithString: "")
    private let toast = NSButton(title: "", target: nil, action: nil)
    private var countdownTimer: Timer?
    private var recClock: Timer?
    private var recStart = Date()
    private var lastSavedURL: URL?
    private var isCountingDown = false

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
        textView.delegate = self
        textView.string = Settings.text
        applyFont()

        root.addSubview(scrollView)

        let strip = DragStrip()
        strip.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(strip)

        // Controls (bottom-right, subtle)
        playButton = IconButton(symbol: "play.fill", target: self, action: #selector(togglePlay), tip: "Play / Pause (⌘↩)")
        let restartButton = IconButton(symbol: "arrow.counterclockwise", target: self, action: #selector(restart), tip: "Back to top")
        let gear = IconButton(symbol: "gearshape.fill", target: self, action: #selector(showSettings(_:)), tip: "Settings")
        cameraButton = IconButton(symbol: "video", target: self, action: #selector(toggleCameraPreview), tip: "Show camera")
        recordButton = IconButton(symbol: "record.circle", target: self, action: #selector(toggleRecord), tip: "Record (⌘R)")
        recordButton.contentTintColor = NSColor.systemRed

        let controls = NSStackView(views: [cameraButton, recordButton, restartButton, playButton, gear])
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

        buildCameraUI(in: root, below: strip)
    }

    private func buildCameraUI(in root: NSView, below strip: NSView) {
        // Small mirrored preview, top-right corner.
        previewLayer = AVCaptureVideoPreviewLayer(session: recorder.session)
        previewLayer.videoGravity = .resizeAspectFill
        previewView.layer = previewLayer
        previewView.wantsLayer = true
        previewLayer.cornerRadius = 8
        previewLayer.masksToBounds = true
        previewLayer.borderWidth = 1
        previewLayer.borderColor = NSColor(white: 1, alpha: 0.15).cgColor
        previewView.isHidden = true
        previewView.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(previewView)

        // "● REC 0:12" badge, top-left.
        recBadge.font = .monospacedDigitSystemFont(ofSize: 12, weight: .semibold)
        recBadge.textColor = .white
        recBadge.wantsLayer = true
        recBadge.layer?.backgroundColor = NSColor.systemRed.withAlphaComponent(0.9).cgColor
        recBadge.layer?.cornerRadius = 9
        recBadge.alignment = .center
        recBadge.isHidden = true
        recBadge.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(recBadge)

        // Big 3-2-1 in the middle.
        countdownLabel.font = .systemFont(ofSize: 120, weight: .bold)
        countdownLabel.textColor = .white
        countdownLabel.alignment = .center
        countdownLabel.wantsLayer = true
        countdownLabel.shadow = { let s = NSShadow(); s.shadowBlurRadius = 20; s.shadowColor = .black; return s }()
        countdownLabel.isHidden = true
        countdownLabel.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(countdownLabel)

        // "Saved" note, bottom-left. Click it to see the file in Finder.
        toast.isBordered = false
        toast.target = self
        toast.action = #selector(revealLastTake)
        toast.wantsLayer = true
        toast.layer?.backgroundColor = NSColor(white: 0.12, alpha: 0.95).cgColor
        toast.layer?.cornerRadius = 14
        toast.isHidden = true
        toast.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(toast)

        NSLayoutConstraint.activate([
            previewView.topAnchor.constraint(equalTo: strip.bottomAnchor, constant: 4),
            previewView.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -12),
            previewView.widthAnchor.constraint(equalToConstant: 144),
            previewView.heightAnchor.constraint(equalToConstant: 81),
            recBadge.topAnchor.constraint(equalTo: strip.bottomAnchor, constant: 4),
            recBadge.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 12),
            recBadge.widthAnchor.constraint(equalToConstant: 82),
            recBadge.heightAnchor.constraint(equalToConstant: 18),
            countdownLabel.centerXAnchor.constraint(equalTo: root.centerXAnchor),
            countdownLabel.centerYAnchor.constraint(equalTo: root.centerYAnchor),
            toast.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 12),
            toast.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -12),
            toast.heightAnchor.constraint(equalToConstant: 28),
        ])

        recorder.onStarted = { [weak self] in self?.recordingDidStart() }
        recorder.onFinished = { [weak self] url in self?.recordingDidFinish(url) }
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

    // MARK: Camera + recording

    private var isBusyRecording: Bool { recorder.isRecording || isCountingDown }
    var isRecordingTake: Bool { isBusyRecording }

    private func setPreviewVisible(_ visible: Bool) {
        if visible, let c = previewLayer.connection, c.isVideoMirroringSupported {
            c.automaticallyAdjustsVideoMirroring = false
            c.isVideoMirrored = true   // preview looks like a mirror; the saved video is normal
        }
        previewView.isHidden = !visible
    }

    @objc func toggleCameraPreview() {
        if previewPinned {
            previewPinned = false
            cameraButton.setSymbol("video")
            if !isBusyRecording {
                setPreviewVisible(false)
                recorder.stopCamera()
            }
            return
        }
        recorder.startCamera { [weak self] ok in
            guard let self = self else { return }
            guard ok else { self.showPermissionAlert(); return }
            self.previewPinned = true
            self.cameraButton.setSymbol("video.fill")
            self.setPreviewVisible(true)
        }
    }

    @objc func toggleRecord() {
        if isBusyRecording { stopRecording(); return }
        recorder.startCamera { [weak self] ok in
            guard let self = self else { return }
            guard ok else { self.showPermissionAlert(); return }
            self.setPreviewVisible(true)
            self.toast.isHidden = true
            self.pause()
            self.offset = 0
            self.scroll(to: 0)
            self.isCountingDown = true
            self.recordButton.setSymbol("stop.circle.fill")
            self.recordButton.toolTip = "Stop recording (⌘R)"
            self.recorder.startRecording()
        }
    }

    /// Camera is rolling: run 3-2-1, then start scrolling from the top.
    private func recordingDidStart() {
        recStart = Date()
        recBadge.isHidden = false
        updateRecBadge()
        recClock?.invalidate()
        recClock = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.updateRecBadge() }

        var n = 3
        countdownLabel.stringValue = "\(n)"
        countdownLabel.isHidden = false
        countdownTimer?.invalidate()
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] t in
            guard let self = self else { t.invalidate(); return }
            n -= 1
            if n > 0 {
                self.countdownLabel.stringValue = "\(n)"
            } else {
                t.invalidate()
                self.countdownLabel.isHidden = true
                self.isCountingDown = false
                if self.recorder.isRecording { self.play() }
            }
        }
    }

    private func updateRecBadge() {
        let secs = Int(Date().timeIntervalSince(recStart))
        recBadge.stringValue = String(format: "● REC %d:%02d", secs / 60, secs % 60)
    }

    func stopRecording() {
        countdownTimer?.invalidate()
        countdownLabel.isHidden = true
        isCountingDown = false
        pause()
        recorder.stopRecording()
    }

    private func recordingDidFinish(_ url: URL?) {
        recClock?.invalidate()
        recBadge.isHidden = true
        countdownLabel.isHidden = true
        isCountingDown = false
        recordButton.setSymbol("record.circle")
        recordButton.toolTip = "Record (⌘R)"
        if !previewPinned {
            setPreviewVisible(false)
            recorder.stopCamera()
        }

        lastSavedURL = url
        let text = url == nil ? "  Recording failed, try again  " : "  Saved to Movies › Teleprompter  "
        toast.attributedTitle = NSAttributedString(string: text, attributes: [
            .foregroundColor: url == nil ? NSColor.systemRed : NSColor.white,
            .font: NSFont.systemFont(ofSize: 12, weight: .medium),
        ])
        toast.toolTip = url == nil ? nil : "Show in Finder"
        toast.isHidden = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.toast.isHidden = true }
    }

    @objc private func revealLastTake() {
        if let url = lastSavedURL { NSWorkspace.shared.activateFileViewerSelecting([url]) }
        toast.isHidden = true
    }

    private func showPermissionAlert() {
        let a = NSAlert()
        a.messageText = "Teleprompter can't use the camera"
        a.informativeText = "Turn on Teleprompter in System Settings › Privacy & Security › Camera (and Microphone), then try again."
        a.addButton(withTitle: "Open Settings")
        a.addButton(withTitle: "Cancel")
        if a.runModal() == .alertFirstButtonReturn,
           let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera") {
            NSWorkspace.shared.open(url)
        }
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
            case 15 where cmd:             // ⌘R  record / stop
                c.toggleRecord(); return nil
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

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard controller.isRecordingTake else { return .terminateNow }
        controller.stopRecording()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { NSApp.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
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
