## 🔬 Grain Tracer v1.1.0

Grain size analysis for SEM images, now as a macOS app, a Windows app and a browser page. This release adds a statistics table for all samples, automatic boundary type detection and a validation study on synthetic SEM images.

### ✨ New
- 🪟 **Windows app** (Windows 10/11, 64-bit) with the same features as the macOS app: save dialogs, Open with, drag onto the window.
- 📊 **Statistics table** for every sample on the Result canvas: N, mean, SD, 95 % CI, %RA, D10/D50/D90, area-weighted ECD, Lx, Ly, aspect ratio, Minimum ECD and a reliability check. Switch between table + plot, table only and plot only.
- 🧭 **Automatic boundary type**: `Line` (dark / bright) or `Contrast` is chosen when an image opens; **Detect Automatically** runs it again.
- 📏 **95 % confidence interval and %RA** of the mean ECD, in the app, CSV and Excel reports.
- ⚠️ **Reliability check**: warns for grains under ~75 px across, fewer than 50 grains, or %RA above 10 %.
- 📑 **Excel reports**: per-sample report (summary page with original and detected images, histogram, figures, grain table) and All Samples report (comparison sheet, one sheet per sample, combined grain table).
- 📋 **Copy to clipboard** for the current view or plot (⌘⇧C / Ctrl+Shift+C) and a live preview in Export Image.
- ❓ **Help pop-ups** with diagrams, in English and Korean.
- 🎚️ **Minimum ECD per sample**, and the sample selection is kept separately for each plot.
- 🧪 **Close All**, and **Demo Sample** cycles through five synthetic styles with known ground truth.

### 🔧 Changed
- Clearer parameter names: Boundary width σ, Line length filter, Start / Continue level.
- Images are called Samples; the left panel is the Workspace.
- CSV export is one file with the summary and the grain table.
- Legends show sample names only (N and mean optional).
- Edit tools in Settings are icon buttons.

### 🐛 Fixed
- Scale bar ticks hidden under a bright boundary or particle could make detection fail or read the wrong spacing.
- The µm rulers covered part of the image; the view now fits inside them.
- Undo after opening an image could restore the boundary type from before automatic detection.
- Dragging the legend could also untick data sets.

### ✅ Validation
156 runs on synthetic SEM images with known boundaries: linear intercept +1.1 ± 4.8 % and area-weighted ECD +1.8 ± 4.6 % against the true values. See the README for the method and limits.

### 📦 Install
- 🍎 **macOS** (12 or later): download `GrainTracer-1.1.0-macOS.zip`, unzip and move the app to Applications. First launch: right-click ▸ **Open** (macOS 14 and earlier), or **System Settings ▸ Privacy & Security ▸ Open Anyway** (macOS 15 and later).
- 🪟 **Windows** (10/11, 64-bit): download `GrainTracer-1.1.0-Windows.zip`, unzip and run `GrainTracer.exe`. If SmartScreen warns, click **More info ▸ Run anyway**.
- 🌐 **Browser**: open `index.html` from the source code in Chrome, Edge or Safari.
