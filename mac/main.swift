// Grain Tracer for macOS: a native window around index.html (the same page as the browser and Windows versions).
//  - index.html is loaded from the app bundle (Contents/Resources/web)
//  - exports arrive from the page as { name, data(base64) } on the "save" handler and are written through a save panel
//  - File ▸ Open Image…, Open With in Finder and drops on the Dock icon hand files to the page (window.__gtOpen);
//    a Hitachi .txt with the same name is sent along so the pixel size is read
// Build: ./build.sh (Command Line Tools only)
import Cocoa
import WebKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let fileExts: Set<String> = ["tif", "tiff", "png", "jpg", "jpeg", "bmp", "webp", "txt"]

    var window: NSWindow!
    var web: WKWebView!
    var titleObservation: NSKeyValueObservation?
    var pageLoaded = false
    var pending: [URL] = []

    // MARK: launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "save")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self

        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: min(1440, screen.width), height: min(900, screen.height))
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Grain Tracer"
        window.minSize = NSSize(width: 960, height: 600)
        window.contentView = web
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("GrainTracerMainWindow")
        window.makeKeyAndOrderFront(nil)

        titleObservation = web.observe(\.title, options: [.new]) { [weak self] view, _ in
            if let t = view.title, !t.isEmpty { self?.window.title = t }
        }

        guard let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") else {
            let alert = NSAlert()
            alert.messageText = "index.html is missing from the app bundle."
            alert.informativeText = "Build the app again with ./build.sh."
            alert.runModal()
            NSApp.terminate(nil)
            return
        }
        web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Open With in Finder, drops on the Dock icon (may arrive before the page has loaded)
    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        open(filenames.map { URL(fileURLWithPath: $0) })
        sender.reply(toOpenOrPrint: .success)
    }

    // MARK: opening files

    @objc func openImage(_ sender: Any?) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = Self.fileExts.compactMap { UTType(filenameExtension: $0) }
        panel.beginSheetModal(for: window) { response in
            if response == .OK { self.open(panel.urls) }
        }
    }

    func open(_ urls: [URL]) {
        guard pageLoaded, web != nil else { pending += urls; return }
        var list = urls
        for url in urls {
            let txt = url.deletingPathExtension().appendingPathExtension("txt")
            if !list.contains(txt) && FileManager.default.fileExists(atPath: txt.path) { list.append(txt) }
        }
        let items: [String] = list.filter { Self.fileExts.contains($0.pathExtension.lowercased()) }.compactMap { url in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return "{name:\(jsString(url.lastPathComponent)),b64:'\(data.base64EncodedString())'}"
        }
        if items.isEmpty { return }
        web.evaluateJavaScript("window.__gtOpen([\(items.joined(separator: ","))])", completionHandler: nil)
    }

    // <input type="file"> in the page (Add Images)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    // MARK: saving exports

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "save",
              let body = message.body as? [String: Any],
              let name = body["name"] as? String,
              let b64 = body["data"] as? String,
              let data = Data(base64Encoded: b64) else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        let ext = (name as NSString).pathExtension
        if !ext.isEmpty, let type = UTType(filenameExtension: ext) { panel.allowedContentTypes = [type] }
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try data.write(to: url)
            } catch {
                NSAlert(error: error).beginSheetModal(for: self.window, completionHandler: nil)
            }
        }
    }

    // MARK: page events

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        if !pending.isEmpty { let files = pending; pending = []; open(files) }
    }

    // links (e.g. references in help) open in the default browser
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(),
           ["http", "https", "mailto"].contains(scheme) {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // MARK: menus (⌘Z, ⌘⇧C and tool keys are handled by the page, so there is no Undo item here)

    func buildMenu() {
        func item(_ title: String, _ action: Selector?, _ key: String,
                  _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            return i
        }
        let main = NSMenu()

        let appMenu = NSMenu()
        appMenu.addItem(item("About Grain Tracer", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""))
        appMenu.addItem(.separator())
        appMenu.addItem(item("Hide Grain Tracer", #selector(NSApplication.hide(_:)), "h"))
        appMenu.addItem(item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]))
        appMenu.addItem(item("Show All", #selector(NSApplication.unhideAllApplications(_:)), ""))
        appMenu.addItem(.separator())
        appMenu.addItem(item("Quit Grain Tracer", #selector(NSApplication.terminate(_:)), "q"))

        let fileMenu = NSMenu(title: "File")
        let openItem = item("Open Image…", #selector(openImage(_:)), "o")
        openItem.target = self
        fileMenu.addItem(openItem)
        fileMenu.addItem(.separator())
        fileMenu.addItem(item("Close Window", #selector(NSWindow.performClose(_:)), "w"))

        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(item("Cut", #selector(NSText.cut(_:)), "x"))
        editMenu.addItem(item("Copy", #selector(NSText.copy(_:)), "c"))
        editMenu.addItem(item("Paste", #selector(NSText.paste(_:)), "v"))
        editMenu.addItem(item("Select All", #selector(NSText.selectAll(_:)), "a"))

        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]))

        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        windowMenu.addItem(item("Zoom", #selector(NSWindow.performZoom(_:)), ""))

        for menu in [appMenu, fileMenu, editMenu, viewMenu, windowMenu] {
            let holder = NSMenuItem()
            holder.submenu = menu
            main.addItem(holder)
        }
        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }

    func jsString(_ s: String) -> String {
        // JavaScript string literal; non-ASCII (e.g. Korean file names) as \uXXXX UTF-16 escapes
        var out = "'"
        for c in s.utf16 {
            if c == 0x5C { out += "\\\\" }
            else if c == 0x27 { out += "\\'" }
            else if c < 0x20 || c > 0x7E { out += String(format: "\\u%04x", Int(c)) }
            else { out.append(Character(Unicode.Scalar(UInt8(c)))) }
        }
        return out + "'"
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
