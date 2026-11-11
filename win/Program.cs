// Grain Tracer for Windows: a WebView2 window around index.html (the same page as the browser and macOS versions).
//  - index.html is served from a virtual https host, so localStorage and the clipboard work as in a browser
//  - exports arrive as "save\n<file name>\n<base64>" messages and are written through a Save dialog
//  - files passed on the command line (Open with / drag onto the exe) are opened after the page loads
using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace GrainTracer
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(args));
        }
    }

    sealed class MainForm : Form
    {
        const string Host = "graintracer.local";
        static readonly string[] ImageExt = { ".tif", ".tiff", ".png", ".jpg", ".jpeg", ".bmp", ".webp", ".txt" };
        readonly WebView2 web = new WebView2 { Dock = DockStyle.Fill };
        readonly string[] pending;
        bool opened;

        public MainForm(string[] args)
        {
            pending = args.Where(File.Exists).ToArray();
            Text = "Grain Tracer";
            StartPosition = FormStartPosition.CenterScreen;
            var area = Screen.PrimaryScreen.WorkingArea;
            Size = new Size(Math.Min(1440, area.Width), Math.Min(900, area.Height));
            MinimumSize = new Size(960, 600);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            Controls.Add(web);
            Load += async (s, e) => await InitAsync();
        }

        async Task InitAsync()
        {
            try
            {
                string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GrainTracer");
                var env = await CoreWebView2Environment.CreateAsync(null, data);
                await web.EnsureCoreWebView2Async(env);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                MessageBox.Show(this, "Microsoft Edge WebView2 Runtime is required.\nInstall it from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and start Grain Tracer again.",
                    "Grain Tracer", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close();
                return;
            }
            var cw = web.CoreWebView2;
            string root = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");
            cw.SetVirtualHostNameToFolderMapping(Host, root, CoreWebView2HostResourceAccessKind.Allow);
            cw.Settings.IsStatusBarEnabled = false;
            cw.DocumentTitleChanged += (s, e) => Text = cw.DocumentTitle;
            cw.WebMessageReceived += OnMessage;
            cw.NavigationCompleted += (s, e) => { if (!opened && pending.Length > 0) { opened = true; OpenFiles(pending); } };
            cw.NewWindowRequested += (s, e) => // links (e.g. help references) open in the default browser
            {
                e.Handled = true;
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
            };
            cw.Navigate("https://" + Host + "/index.html");
        }

        // hand files to the page; a Hitachi .txt with the same name is sent along so the pixel size is read
        void OpenFiles(string[] files)
        {
            var list = files.ToList();
            foreach (var f in files)
            {
                string txt = Path.ChangeExtension(f, ".txt");
                if (!list.Contains(txt, StringComparer.OrdinalIgnoreCase) && File.Exists(txt)) list.Add(txt);
            }
            var sb = new StringBuilder("window.__gtOpen([");
            foreach (var f in list.Where(p => ImageExt.Contains(Path.GetExtension(p).ToLowerInvariant())))
                sb.Append("{name:").Append(JsString(Path.GetFileName(f))).Append(",b64:'").Append(Convert.ToBase64String(File.ReadAllBytes(f))).Append("'},");
            sb.Append("])");
            _ = web.CoreWebView2.ExecuteScriptAsync(sb.ToString());
        }

        void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg;
            try { msg = e.TryGetWebMessageAsString(); } catch { return; }
            var parts = msg.Split(new[] { '\n' }, 3);
            if (parts.Length < 3 || parts[0] != "save") return;
            string name = parts[1], ext = Path.GetExtension(name).TrimStart('.').ToLowerInvariant();
            using (var dlg = new SaveFileDialog { FileName = name, OverwritePrompt = true, AddExtension = true, DefaultExt = ext,
                Filter = (ext.Length > 0 ? ext.ToUpperInvariant() + " file|*." + ext + "|" : "") + "All files|*.*" })
            {
                if (dlg.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    File.WriteAllBytes(dlg.FileName, Convert.FromBase64String(parts[2]));
                    web.CoreWebView2.PostWebMessageAsString("saved\n" + Path.GetFileName(dlg.FileName));
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this, "Could not save the file.\n" + ex.Message, "Grain Tracer", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }

        static string JsString(string s)
        {
            var sb = new StringBuilder("'");
            foreach (char c in s)
            {
                if (c == '\\' || c == '\'') sb.Append('\\').Append(c);
                else if (c < 0x20 || c > 0x7e) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('\'').ToString();
        }
    }
}
