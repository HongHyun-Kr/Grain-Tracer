// ---------------- help pop-ups: "?" buttons in section headers open a small window (English / 한국어) ----------------
(() => {
  const C = { ink: '#1e1e1e', mid: '#8c8c8c', soft: '#d9d9d9', bg: '#f4f4f4', blue: '#1f63b5', gb: '#ffb000', red: '#c83c3b', green: '#2e8b3a' };
  const T = (s, x, y, a = 'middle', c = C.mid, sz = 9) => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="${sz}" fill="${c}">${s}</text>`;
  const svg = (w, h, body) => `<svg class="hfig" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${body}</svg>`;
  // small illustrations
  const F = {
    width: () => svg(300, 86, `<rect x="10" y="8" width="120" height="40" fill="#b8b8b8"/><rect x="66" y="8" width="8" height="40" fill="#4a4a4a"/><rect x="62" y="8" width="16" height="40" fill="#4a4a4a" opacity=".35"/>
      <path d="M10 70 H55 C62 70 64 84 70 84 C76 84 78 70 85 70 H130" fill="none" stroke="${C.ink}" stroke-width="1.4"/><path d="M62 62 H78" stroke="${C.blue}" stroke-width="1.3"/><path d="M62 59v6M78 59v6" stroke="${C.blue}"/>${T('σ', 70, 58, 'middle', C.blue, 10)}
      ${T('line in the image', 70, 4 + 2, 'middle', C.mid, 8)}<g transform="translate(160 0)"><rect x="0" y="8" width="130" height="40" fill="#b8b8b8"/><path d="M0 28 H130" stroke="#4a4a4a" stroke-width="1.2"/>
      <g fill="#6a6a6a"><circle cx="22" cy="18" r="1.3"/><circle cx="57" cy="40" r="1.3"/><circle cx="98" cy="15" r="1.3"/><circle cx="114" cy="38" r="1.3"/></g>
      <path d="M0 70 H55 C61 70 62 80 65 80 C68 80 69 70 75 70 H130" fill="none" stroke="${C.ink}" stroke-width="1.4"/>${T('σ too small → noise dots respond too', 65, 4 + 2, 'middle', C.mid, 8)}</g>`),
    length: () => svg(300, 70, `<g fill="${C.mid}">${[0, 1, 2, 3, 4, 5, 6].map(i => `<circle cx="${18 + i * 16}" cy="22" r="3"/>`).join('')}</g><path d="M14 50 H128" stroke="${C.ink}" stroke-width="3"/>
      <path d="M150 22 l14 0 m-5 -4 l5 4 l-5 4 M150 50 l14 0 m-5 -4 l5 4 l-5 4" stroke="${C.mid}" fill="none"/>
      <g fill="${C.soft}">${[0, 1, 2, 3, 4, 5, 6].map(i => `<circle cx="${184 + i * 16}" cy="22" r="3"/>`).join('')}</g>${T('removed', 288, 38, 'end', C.red, 9)}<path d="M180 50 H290" stroke="${C.gb}" stroke-width="3"/>${T('kept', 288, 64, 'end', C.green, 9)}
      <path d="M14 62 H62" stroke="${C.blue}"/><path d="M14 59v6M62 59v6" stroke="${C.blue}"/>${T('L', 38, 70, 'middle', C.blue, 9)}`),
    levels: () => svg(300, 96, `<path d="M8 82 C30 82 34 18 52 18 S70 62 86 62 S104 30 118 30 S140 74 160 74 S180 52 192 52 S210 80 230 80 S252 60 262 66 S282 82 292 82" fill="none" stroke="${C.ink}" stroke-width="1.4"/>
      <path d="M8 34 H292" stroke="${C.red}" stroke-dasharray="4 3"/><path d="M8 58 H292" stroke="${C.blue}" stroke-dasharray="4 3"/>${T('Start', 290, 30, 'end', C.red)}${T('Continue', 290, 55, 'end', C.blue)}
      <path d="M38 58 C42 36 46 18 52 18 S64 40 70 52 L78 58 M92 58 C98 46 108 30 118 30 S134 46 142 58" fill="none" stroke="${C.gb}" stroke-width="3.5" stroke-linecap="round" opacity=".9"/>
      <path d="M178 58 C182 54 186 52 192 52 S200 54 205 58" fill="none" stroke="${C.mid}" stroke-width="3.5" stroke-linecap="round" opacity=".6"/>
      ${T('boundary: peak passes Start, then grows down to Continue', 150, 94, 'middle', C.ink, 8)}${T('ignored', 192, 46, 'middle', C.mid, 8)}`),
    split: () => svg(300, 72, `<path d="M40 14 a24 24 0 1 0 0 44 a20 20 0 0 0 14-5 a8 8 0 0 1 10 0 a20 20 0 0 0 14 5 a24 24 0 1 0 0-44 a20 20 0 0 0-14 5 a8 8 0 0 1-10 0 a20 20 0 0 0-14-5z" fill="#eaeaea" stroke="${C.ink}" stroke-width="1.3"/>
      <path d="M59 8 V64" stroke="${C.gb}" stroke-width="2" stroke-dasharray="3 2"/>${T('narrow neck → two grains', 59, 71, 'middle', C.ink, 8)}
      <g transform="translate(160 0)"><path d="M40 14 a24 24 0 1 0 0 44 c8 0 12-6 18-6 s10 6 18 6 a24 24 0 1 0 0-44 c-8 0-12 6-18 6 s-10-6-18-6z" fill="#eaeaea" stroke="${C.ink}" stroke-width="1.3"/>${T('shallow neck → one grain', 58, 71, 'middle', C.ink, 8)}</g>`),
    merge: () => svg(300, 66, `<rect x="10" y="10" width="110" height="44" rx="3" fill="#eaeaea" stroke="${C.gb}" stroke-width="2"/><path d="M62 10 V54" stroke="${C.gb}" stroke-width="2" stroke-dasharray="2 3" opacity=".7"/>${T('weak shared boundary', 65, 64, 'middle', C.mid, 8)}
      <path d="M135 32 h22 m-6 -5 l6 5 l-6 5" stroke="${C.mid}" fill="none"/><rect x="172" y="10" width="110" height="44" rx="3" fill="#eaeaea" stroke="${C.gb}" stroke-width="2"/>${T('merged', 227, 64, 'middle', C.green, 8)}`),
    model: () => { const cells = (bg, ln, fill) => `<rect width="84" height="56" fill="${bg}"/><path d="M0 22 L30 18 L52 30 L84 24 M30 18 L26 0 M52 30 L46 56 M52 30 L70 0 M30 18 L18 56" stroke="${ln}" stroke-width="${ln === 'none' ? 0 : 2}" fill="none"/>${fill || ''}`;
      return svg(300, 80, `<g transform="translate(6 4)">${cells('#bdbdbd', '#3a3a3a')}</g>${T('Line · dark', 48, 74, 'middle', C.ink, 8.5)}
        <g transform="translate(108 4)">${cells('#6b6b6b', '#efefef')}</g>${T('Line · bright', 150, 74, 'middle', C.ink, 8.5)}
        <g transform="translate(210 4)"><path d="M0 0H84V56H0z" fill="#9a9a9a"/><path d="M0 0 H70 L52 30 L30 18 L26 0z" fill="#c8c8c8"/><path d="M52 30 L84 24 V56 H46z" fill="#7a7a7a"/><path d="M0 22 L30 18 L18 56 H0z" fill="#b0b0b0"/></g>${T('Contrast', 252, 74, 'middle', C.ink, 8.5)}`); },
    scale: () => svg(300, 54, `<rect x="0" y="0" width="300" height="34" fill="#9a9a9a"/>${Array.from({ length: 11 }, (_, i) => `<path d="M${40 + i * 22} 10 v9" stroke="#fff" stroke-width="2"/>`).join('')}${T('2.00um', 270, 30, 'middle', '#fff', 10)}
      <path d="M40 44 H260" stroke="${C.blue}"/><path d="M40 40v8M260 40v8" stroke="${C.blue}"/>${T('11 ticks = 10 divisions = printed value (2 µm)', 150, 53, 'middle', C.blue, 8.5)}`),
    roi: () => svg(300, 92, `<rect x="0" y="0" width="300" height="92" fill="#e6e6e6"/><rect x="0" y="74" width="300" height="18" fill="#9a9a9a"/>${T('data bar (excluded)', 150, 86, 'middle', '#fff', 8.5)}
      <path d="M40 0 L52 30 L20 48 L0 44 M52 30 L110 24 L118 0 M110 24 L132 60 L92 74 M20 48 L40 74 M132 60 L200 52 L214 18 L190 0 M200 52 L232 74 M214 18 L268 30 L300 22 M268 30 L262 74" stroke="#555" stroke-width="1.2" fill="none"/>
      <path d="M52 30 L110 24 L132 60 L92 74 L40 74 L20 48 Z" fill="#7fb8e8" opacity=".6"/><path d="M132 60 L200 52 L232 74 L92 74 Z" fill="#9fd69a" opacity=".6"/><path d="M110 24 L118 0 L190 0 L214 18 L200 52 L132 60 Z" fill="#c8c8c8"/>
      ${T('touches border → gray', 160, 14, 'middle', C.ink, 8)}<rect x="0.5" y="0.5" width="299" height="73" fill="none" stroke="${C.blue}" stroke-width="1.5" stroke-dasharray="5 3"/>`),
    cdf: () => svg(300, 96, `<path d="M30 8 V80 H292" stroke="${C.mid}" fill="none"/><path d="M30 78 C90 78 100 72 120 56 S160 18 200 12 S260 9 290 9" fill="none" stroke="${C.blue}" stroke-width="1.8"/>
      ${[[0.1, 104, 'D10'], [0.5, 140, 'D50'], [0.9, 180, 'D90']].map(([p, x, l]) => { const y = 80 - p * 72; return `<path d="M30 ${y} H${x} V80" stroke="${C.gb}" stroke-dasharray="3 2" fill="none"/>${T(l, x, 92, 'middle', C.ink, 8.5)}${T(p * 100 + '%', 26, y + 3, 'end', C.mid, 8)}`; }).join('')}`),
    shape: () => svg(300, 76, `<ellipse cx="80" cy="38" rx="58" ry="24" fill="#eaeaea" stroke="${C.ink}" stroke-width="1.3"/><path d="M22 38 H138" stroke="${C.blue}"/><path d="M80 14 V62" stroke="${C.red}"/>
      ${T('a (major)', 106, 49, 'middle', C.blue, 8.5)}${T('b', 86, 24, 'start', C.red, 8.5)}${T('aspect ratio AR = a / b', 225, 34, 'middle', C.ink, 10)}${T('1 = round, ≥ 2 = clearly elongated', 225, 50, 'middle', C.mid, 8.5)}`),
    intercept: () => svg(300, 80, `<rect x="0" y="0" width="160" height="80" fill="#eaeaea"/><path d="M30 0 L40 30 L0 40 M40 30 L90 26 L100 0 M90 26 L110 60 L70 80 M40 30 L30 80 M110 60 L160 50 M90 26 L160 20" stroke="#555" stroke-width="1.2" fill="none"/>
      <path d="M0 15 H160 M0 45 H160 M0 70 H160" stroke="${C.blue}" stroke-dasharray="3 2"/>${[[34, 15], [97, 15], [3, 45], [111, 45], [154, 45], [34, 70], [104, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${C.gb}"/>`).join('')}
      ${T('Lx = line length / crossings', 230, 34, 'middle', C.ink, 9.5)}${T('Ly: same with vertical lines', 230, 50, 'middle', C.mid, 8.5)}`),
    ci: () => svg(300, 56, `<path d="M20 30 H280" stroke="${C.soft}"/><path d="M110 30 H190" stroke="${C.blue}" stroke-width="2"/><path d="M110 22v16M190 22v16" stroke="${C.blue}" stroke-width="2"/><circle cx="150" cy="30" r="4" fill="${C.ink}"/>
      ${T('mean', 150, 16, 'middle', C.ink, 8.5)}${T('95 % CI: mean ± t·SD/√N', 150, 52, 'middle', C.blue, 9)}`),
    edits: () => { const box = (x, lab, body) => `<g transform="translate(${x} 4)"><rect width="64" height="46" rx="3" fill="#eaeaea" stroke="${C.soft}"/>${body}</g>${T(lab, x + 32, 64, 'middle', C.ink, 8.5)}`;
      return svg(300, 70, box(4, 'Draw GB', `<path d="M6 30 C20 20 40 28 58 16" stroke="${C.gb}" stroke-width="2.5" fill="none"/>`) + box(78, 'Erase GB', `<path d="M6 30 C20 20 40 28 58 16" stroke="${C.gb}" stroke-width="2.5" fill="none" stroke-dasharray="4 4" opacity=".5"/><path d="M26 10 l12 12 m0 -12 l-12 12" stroke="${C.red}" stroke-width="1.6"/>`)
        + box(152, 'Split', `<path d="M32 2 V44" stroke="${C.gb}" stroke-width="2" stroke-dasharray="3 2"/><circle cx="16" cy="23" r="3.2" fill="${C.blue}"/><circle cx="48" cy="23" r="3.2" fill="${C.blue}"/>`) + box(226, 'Merge', `<path d="M32 2 V44" stroke="${C.gb}" stroke-width="2" opacity=".3"/><path d="M14 23 H50" stroke="${C.blue}" stroke-width="1.6"/><circle cx="14" cy="23" r="3" fill="${C.blue}"/><circle cx="50" cy="23" r="3" fill="${C.blue}"/>`)); },
  };
  const H = {
    scale: { t: ['Scale', '스케일'], items: [
      { fig: 'scale', en: 'Sizes are computed from the pixel size (nm/px), read from the scale bar when the image opens. The printed number is not read — check <b>Scale bar value</b>.', ko: '크기는 픽셀 크기(nm/px)로 계산되고, 이 값은 이미지를 열 때 스케일 바에서 읽습니다. 바 옆 숫자는 읽지 못하니 <b>Scale bar value</b>를 확인하세요.' },
      { h: ['Finding the bar', '바 찾기'], en: '<b>Auto Detect</b> searches again · <b>Find in Box</b>: box around the bar · <b>Trace Bar</b>: draw along it · <b>Show Scale</b>: mark the bar in use.', ko: '<b>Auto Detect</b> 다시 찾기 · <b>Find in Box</b> 바 주위에 박스 · <b>Trace Bar</b> 바를 따라 긋기 · <b>Show Scale</b> 사용 중인 바 표시' },
      { h: ['Pixel size', 'Pixel size'], en: 'Typing a value overrides the bar. A Hitachi .txt with the same name is used first.', ko: '직접 입력하면 바 대신 이 값을 씁니다. 같은 이름의 Hitachi .txt가 있으면 그 값이 우선입니다.' } ] },
    sizemap: { t: ['Size Map Coloring', 'Size Map 색'], items: [
      { en: 'Grains colored by ECD, range D2–D98. Gray = excluded from statistics. Viridis/Plasma stay readable in grayscale.', ko: '결정립을 ECD 크기별로 색칠합니다(범위 D2~D98). 회색은 통계에서 빠진 결정립입니다. 흑백 인쇄에는 Viridis, Plasma가 좋습니다.' } ] },
    roi: { t: ['Region of Interest', '분석 영역 (ROI)'], items: [
      { fig: 'roi', en: 'Only grains inside the ROI are measured. The default leaves out the data bar. Drag the edges with <b>Edit in Graphics</b>; <b>Reset</b> restores it.', ko: 'ROI 안의 결정립만 잽니다. 기본 영역은 하단 데이터 바를 뺀 부분입니다. <b>Edit in Graphics</b>로 테두리를 끌어 조정하고, <b>Reset</b>으로 되돌립니다.' } ] },
    model: { t: ['Boundary Model', '경계 모델'], items: [
      { fig: 'model', en: 'Set automatically when an image opens (see Messages). Change it only if detection looks wrong.', ko: '이미지를 열 때 자동으로 정해집니다(Messages 참고). 검출이 이상할 때만 바꾸세요.' },
      { h: ['Boundary type', 'Boundary type'], en: '<b>Line</b>: boundaries are thin lines (grooves, cracks). <b>Contrast</b>: no line, grains differ in tone.', ko: '<b>Line</b>: 경계가 가는 선(홈, 균열). <b>Contrast</b>: 선 없이 결정립끼리 밝기만 다름.' },
      { h: ['Line tone', 'Line tone'], en: 'Dark or bright line. <b>Dark and bright</b> is a fallback; it can pick up halos and is usually less accurate.', ko: '선이 어두운지 밝은지 고릅니다. <b>Dark and bright</b>는 halo까지 잡을 수 있어 보조용입니다.' },
      { h: ['Computation scale', 'Computation scale'], en: 'Reduced image for speed. Use 1/1 for grains under ~75 px across.', ko: '속도를 위해 축소해서 계산합니다. 결정립이 약 75 px보다 작으면 1/1을 쓰세요.' } ] },
    params: { t: ['Detection Parameters', '검출 파라미터'], intro: ['Change one at a time, then Process. Defaults are set in nm and follow the pixel size.', '하나씩 바꾸고 Process로 확인하세요. 기본값은 nm 기준이라 픽셀 크기에 맞게 바뀝니다.'], items: [
      { h: ['Boundary width σ', 'Boundary width σ'], fig: 'width', en: 'Thickness of the boundary line to look for.<br>Noise picked up → raise · thin lines missed → lower', ko: '찾을 경계선의 두께입니다.<br>노이즈가 잡히면 ↑ · 가는 선을 놓치면 ↓' },
      { h: ['Line length filter', 'Line length filter'], fig: 'length', en: 'Keeps only line-like signal at least this long; removes dots and specks.<br>Dotted or speckled surface → raise', ko: '이 길이 이상 이어진 선만 남기고 점·얼룩은 지웁니다.<br>점무늬가 많으면 ↑' },
      { h: ['Start / Continue level', 'Start / Continue level'], fig: 'levels', en: 'A boundary starts above <b>Start</b> and extends down to <b>Continue</b> (1 = strongest signal).<br>False lines in grains → raise Start · broken boundaries → lower Continue', ko: '신호가 <b>Start</b>를 넘는 곳에서 경계가 시작되고, <b>Continue</b>까지 이어집니다(1 = 가장 센 신호).<br>결정립 안에 가짜 선 → Start ↑ · 경계가 끊김 → Continue ↓' },
      { h: ['Split depth h', 'Split depth h'], fig: 'split', en: 'How narrow a neck must be to split two regions.<br>Grains cut in two → raise · two grains counted as one → lower', ko: '두 영역 사이 목이 얼마나 좁아야 나눌지 정합니다.<br>결정립이 둘로 잘림 → ↑ · 두 결정립이 하나로 셈 → ↓' },
      { h: ['Weak-boundary merge', 'Weak-boundary merge'], fig: 'merge', en: 'Joins neighbours whose shared boundary is weaker than this.<br>Faint false boundaries → raise · Off = keep all', ko: '공유 경계가 이 값보다 약하면 두 결정립을 합칩니다.<br>희미한 가짜 경계가 많으면 ↑ · Off는 합치지 않음' } ] },
    edits: { t: ['Manual Edits', '수동 편집'], items: [
      { fig: 'edits', en: '<b>Draw</b> add a boundary · <b>Erase</b> remove one · <b>Split</b> click (or drag across) a grain · <b>Merge</b> click two grains. Edits are kept when you process again.', ko: '<b>Draw</b> 경계 추가 · <b>Erase</b> 경계 삭제 · <b>Split</b> 결정립 클릭(또는 가로질러 드래그) · <b>Merge</b> 두 결정립 차례로 클릭. 다시 처리해도 편집은 유지됩니다.' } ] },
    filter: { t: ['Grain Filter', '결정립 필터'], items: [
      { h: ['Minimum ECD (this sample)', 'Minimum ECD (시료별)'], en: 'Smaller grains (mostly noise fragments) are left out of this sample\'s statistics. Default 80 nm. Match your reference method, e.g. the EBSD minimum grain size.', ko: '이보다 작은 결정립(대부분 노이즈 조각)은 이 시료 통계에서 뺍니다. 기본 80 nm. 비교할 방법(EBSD 등)의 최소 크기에 맞추세요.' },
      { h: ['Exclude grains touching ROI border', 'ROI 경계 결정립 제외'], en: 'Cut grains look too small, so they are excluded (gray). Shared by all samples. EBSD often includes them.', ko: '경계에 잘린 결정립은 작게 나와서 뺍니다(회색). 모든 시료 공통입니다. EBSD는 보통 포함합니다.' } ] },
    stats: { t: ['Statistics', '통계 항목'], items: [
      { h: ['ECD', 'ECD'], en: 'Diameter of a circle with the grain\'s area: 2√(A/π).', ko: '결정립과 면적이 같은 원의 지름: 2√(A/π).' },
      { h: ['Mean ECD vs Area-weighted ECD', 'Mean ECD와 면적가중 ECD'], en: '<b>Mean</b>: every grain counts once, pulled down by small fragments. <b>Area-weighted</b>: big grains count more; compare this one with EBSD (validated within +1.8 %).', ko: '<b>Mean</b>: 모든 결정립을 똑같이 세서 작은 조각에 끌려 내려갑니다. <b>면적가중</b>: 큰 결정립 비중이 커서 EBSD와 비교할 때 씁니다(검증 +1.8 %).' },
      { h: ['95% CI · %RA', '95% CI · %RA'], fig: 'ci', en: 'Precision of the mean from this field. %RA ≤ 10 % is enough; otherwise add fields.', ko: '이 시야로 구한 평균의 정밀도입니다. %RA 10 % 이하면 충분하고, 넘으면 시야를 더 찍으세요.' },
      { h: ['D10 / D50 / D90', 'D10 / D50 / D90'], en: 'Sizes below which 10, 50 (median), 90 % of grains lie.', ko: '결정립의 10, 50(중앙값), 90 %가 이보다 작습니다.' },
      { h: ['Lx / Ly', 'Lx / Ly'], fig: 'intercept', en: 'Linear intercept (ASTM E112), horizontal and vertical. Most accurate in validation (+1.1 %). Ratio ≠ 1 → elongated grains.', ko: '가로·세로 선형 절편(ASTM E112). 검증에서 가장 정확했습니다(+1.1 %). 비율이 1에서 멀면 한쪽으로 늘어난 결정립입니다.' },
      { h: ['Mean AR', '평균 종횡비'], en: 'Major / minor axis of the equivalent ellipse. 1 = round.', ko: '등가 타원의 장축/단축. 1이면 원형.' },
      { h: ['Reliability check', 'Reliability check'], en: 'Warns when grains are under ~75 px, there are fewer than 50, or %RA > 10 %.', ko: '결정립이 약 75 px보다 작거나, 50개 미만이거나, %RA가 10 %를 넘으면 경고합니다.' } ] },
    dist: { t: ['Distribution', '분포'], items: [
      { en: '<b>Number fraction</b>: share of grains per bin. <b>Area fraction</b>: share of area, same as an EBSD area-weighted histogram. Automatic Bins sets the bin width from the data.', ko: '<b>Number fraction</b>: 구간별 결정립 수 비율. <b>Area fraction</b>: 구간별 면적 비율(EBSD 면적가중 히스토그램과 같음). Automatic Bins는 데이터에 맞춰 구간 폭을 정합니다.' } ] },
    cdf: { t: ['Cumulative Distribution', '누적 분포'], items: [
      { fig: 'cdf', en: 'Share of grains smaller than each size. Right = coarser; steeper = more uniform.', ko: '각 크기보다 작은 결정립 비율입니다. 오른쪽일수록 크고, 가파를수록 크기가 고릅니다.' } ] },
    export: { t: ['Export', '내보내기'], items: [
      { en: '<b>Excel Report</b>: this sample, with images and figures<br><b>All Samples Report</b>: comparison of every sample<br><b>CSV Results</b>: plain data for MATLAB, Python, Origin<br><b>Export Image</b>: current view or plot; <b>Copy to Clipboard</b> or ⌘⇧C copies it', ko: '<b>Excel Report</b>: 현재 시료, 이미지와 그림 포함<br><b>All Samples Report</b>: 전체 시료 비교<br><b>CSV Results</b>: MATLAB, Python, Origin용 데이터<br><b>Export Image</b>: 지금 화면이나 그래프 저장, <b>Copy to Clipboard</b>나 ⌘⇧C로 복사' } ] },
  };
  let lang = 'en'; try { lang = localStorage.getItem('graintracer.helpLang') || 'en'; } catch (e) { }
  let pop = null, anchor = null, key = null;
  const close = () => { if (pop) { pop.remove(); pop = null; anchor = null; key = null; } };
  const html = k => { const d = H[k], L = lang === 'ko' ? 1 : 0;
    return `<div class="hpop-h"><span class="hpop-t">${d.t[L]}</span><div class="hlang" role="group"><button data-lang="en" class="${L ? '' : 'on'}">EN</button><button data-lang="ko" class="${L ? 'on' : ''}">한국어</button></div><button class="hpop-x" aria-label="Close">×</button></div>
      <div class="hpop-b">${d.intro ? `<p class="hintro">${d.intro[L]}</p>` : ''}${d.items.map(it => `<div class="hitem">${it.h ? `<div class="hh">${it.h[L]}</div>` : ''}${it.fig ? F[it.fig]() : ''}<p>${L ? it.ko : it.en}</p></div>`).join('')}</div>`; };
  const place = () => { if (!pop || !anchor) return; const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.right + 8, y = r.top - 8; if (x + pw > innerWidth - 8) x = Math.max(8, r.left - pw - 8); if (y + ph > innerHeight - 8) y = Math.max(8, innerHeight - ph - 8); pop.style.left = x + 'px'; pop.style.top = y + 'px'; };
  const open = (k, btn) => { if (key === k) return close(); close(); if (!H[k]) return; key = k; anchor = btn; pop = document.createElement('div'); pop.className = 'hpop'; pop.setAttribute('role', 'dialog'); pop.innerHTML = html(k); document.body.appendChild(pop); place();
    pop.addEventListener('click', e => { const l = e.target.closest('[data-lang]'); if (l) { lang = l.dataset.lang; try { localStorage.setItem('graintracer.helpLang', lang); } catch (x) { } const s = pop.querySelector('.hpop-b').scrollTop; pop.innerHTML = html(key); pop.querySelector('.hpop-b').scrollTop = s; place(); return; } if (e.target.closest('.hpop-x')) close(); }); };
  // a "?" button in every section header that has a topic
  document.querySelectorAll('summary[data-help]').forEach(s => { const b = document.createElement('button'); b.type = 'button'; b.className = 'hbtn'; b.textContent = '?'; b.title = 'Help'; b.dataset.helpBtn = s.dataset.help; s.appendChild(b); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-help-btn]'); if (b) { e.preventDefault(); e.stopPropagation(); open(b.dataset.helpBtn, b); return; } if (pop && !e.target.closest('.hpop')) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); } }, true);
  addEventListener('resize', place); document.addEventListener('scroll', e => { if (pop && !pop.contains(e.target)) place(); }, true);
})();
