## Grain Tracer v1.1.0

Statistics for every sample in one table, automatic boundary type detection, and a validation study on synthetic SEM images.

### New
- **Windows app**: `GrainTracer-1.1.0-Windows.zip` (Windows 10/11, 64-bit) — same features as the macOS app, with save dialogs and Open with.
- **Statistics table** on the Result canvas for all samples: N, mean, SD, 95 % CI, %RA, D10/D50/D90, area-weighted ECD, Lx, Ly, aspect ratio, Minimum ECD and a reliability check. Switch between table + plot, table only and plot only.
- **Automatic boundary type**: `Line` (dark / bright) or `Contrast` is chosen when an image opens. **Detect Automatically** runs it again.
- **95 % confidence interval and %RA** of the mean ECD, in the app, CSV and Excel reports.
- **Reliability check**: warns for grains under ~75 px, fewer than 50 grains, or %RA above 10 %.
- **Excel reports**: per-sample report (summary page with original and detected images, histogram, figures, grain table) and All Samples report (comparison sheet, one sheet per sample, combined grain table).
- **Copy to clipboard** for the current view or plot (⌘⇧C), and a live preview in Export Image.
- **Help pop-ups** (`?`) with diagrams, in English and Korean.
- **Minimum ECD per sample**, and sample selection kept separately for each plot.
- Close All, and Demo Sample now cycles through five synthetic styles with ground truth.

### Changed
- Parameter names: Boundary width σ, Line length filter, Start / Continue level.
- Images are now called Samples; the Analysis Builder is the Workspace.
- CSV export is one file with the summary and the grain table.
- The box plot no longer repeats the sample names in a legend; other legends show sample names only (N and mean optional).

### Fixed
- Scale bar ticks hidden under a bright boundary or particle could make detection fail or read the wrong spacing.
- The µm rulers covered part of the image; the view now fits inside them.
- Undo after opening an image could restore the boundary type from before automatic detection.
- Dragging the legend could also untick data sets.

### Validation
156 runs on synthetic SEM images with known boundaries: linear intercept +1.1 ± 4.8 %, area-weighted ECD +1.8 ± 4.6 % against the true values. See the README for details and limits.

**Install**: download `GrainTracer-1.1.0-macOS.zip`, unzip, move to Applications. First launch: right-click ▸ Open (macOS 14 and earlier) or System Settings ▸ Privacy & Security ▸ Open Anyway (macOS 15+). Windows: download `GrainTracer-1.1.0-Windows.zip`, unzip, run `GrainTracer.exe` (SmartScreen: More info ▸ Run anyway). The browser version is `index.html`.
