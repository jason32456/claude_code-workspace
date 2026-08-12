"""
Generates a demo video of the PIT backtester CLI.
Uses Playwright to render a terminal-style animation and record as MP4.
"""

import subprocess
import sys
import os
import re
import json
import time
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.parent
SCREENSHOTS_DIR = PROJECT_DIR / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

def strip_ansi(text: str) -> str:
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def run_cli_capture():
    """Run CLI and capture both raw and stripped output."""
    cmd = [
        sys.executable, str(PROJECT_DIR / "cli.py"), "run",
        "--strategy", str(PROJECT_DIR / "sample_data/strategies/golden_cross.json"),
        "--prices", str(PROJECT_DIR / "sample_data/prices.csv"),
        "--corporate-actions", str(PROJECT_DIR / "sample_data/corporate_actions.csv"),
        "--universe", str(PROJECT_DIR / "sample_data/universe.csv"),
        "--output-dir", str(PROJECT_DIR / "runs"),
    ]
    env = os.environ.copy()
    env["FORCE_COLOR"] = "1"
    env["TERM"] = "xterm-256color"

    result = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=str(PROJECT_DIR))
    return result.stdout, result.stderr, result.returncode

def build_html_terminal(cli_lines: list[str]) -> str:
    """Build HTML page that animates CLI output in a terminal window."""
    escaped_lines = []
    for line in cli_lines:
        # Escape HTML special chars
        line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        escaped_lines.append(line)

    lines_json = json.dumps(escaped_lines)

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: #0d1117;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
    padding: 24px;
    font-family: 'Courier New', Courier, monospace;
  }}
  .title-bar {{
    width: 900px;
    margin-bottom: 8px;
    color: #58a6ff;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.05em;
    text-align: center;
    padding: 6px 0;
  }}
  .window {{
    width: 900px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7);
    border: 1px solid #30363d;
  }}
  .titlebar {{
    background: #21262d;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #30363d;
  }}
  .dot {{
    width: 12px; height: 12px;
    border-radius: 50%;
  }}
  .red {{ background: #ff5f57; }}
  .yellow {{ background: #ffbd2e; }}
  .green {{ background: #28c840; }}
  .tab-title {{
    margin-left: 12px;
    color: #8b949e;
    font-size: 12px;
  }}
  .terminal {{
    background: #0d1117;
    padding: 16px 20px;
    min-height: 500px;
    font-size: 13px;
    line-height: 1.55;
    color: #e6edf3;
    white-space: pre;
    overflow: hidden;
  }}
  .line {{ display: block; min-height: 1.55em; }}
  .prompt {{ color: #58a6ff; }}
  .cursor {{
    display: inline-block;
    width: 7px;
    height: 14px;
    background: #e6edf3;
    animation: blink 1s step-end infinite;
    vertical-align: text-bottom;
    margin-left: 1px;
  }}
  @keyframes blink {{
    0%, 100% {{ opacity: 1; }}
    50% {{ opacity: 0; }}
  }}
  .badge {{
    display: inline-block;
    background: #1f6feb;
    color: #58a6ff;
    border: 1px solid #1f6feb;
    border-radius: 3px;
    padding: 0 4px;
    font-size: 11px;
    margin-left: 8px;
    vertical-align: middle;
  }}
</style>
</head>
<body>
<div class="title-bar">
  IDX PIT Backtester — Point-in-Time Strategy Backtesting Engine
  <span class="badge">Phase 0</span>
</div>
<div class="window">
  <div class="titlebar">
    <span class="dot red"></span>
    <span class="dot yellow"></span>
    <span class="dot green"></span>
    <span class="tab-title">pit-backtester — python cli.py run --strategy golden_cross.json</span>
  </div>
  <div class="terminal" id="term">
    <span class="line">
      <span class="prompt">$</span> python cli.py run --strategy sample_data/strategies/golden_cross.json \\<br>
      &nbsp;&nbsp;&nbsp;&nbsp;--prices sample_data/prices.csv --corporate-actions sample_data/corporate_actions.csv \\<br>
      &nbsp;&nbsp;&nbsp;&nbsp;--universe sample_data/universe.csv
    </span>
    <span class="line">&nbsp;</span>
  </div>
</div>
<script>
const lines = {lines_json};
const term = document.getElementById('term');
let idx = 0;

// Colorize basic patterns
function colorize(line) {{
  // Box-drawing and separators → dim
  line = line.replace(/([─│╭╮╰╯├┤┬┴┼═╞╡╔╗╚╝║╠╣╦╩╬▓░])/g,
    '<span style="color:#30363d">$1</span>');
  // Green for positive numbers with %
  line = line.replace(/\\b([+]?[0-9]+\\.?[0-9]*%)/g, (m) => {{
    if (m.startsWith('-')) return '<span style="color:#f85149">' + m + '</span>';
    return '<span style="color:#3fb950">' + m + '</span>';
  }});
  // Red for negative
  line = line.replace(/(-[0-9]+\\.?[0-9]*%)/g,
    '<span style="color:#f85149">$1</span>');
  // Highlight ticker symbols
  line = line.replace(/\\b(BBCA|BBRI|TLKM)\\b/g,
    '<span style="color:#d2a8ff; font-weight:bold">$1</span>');
  // IDR amounts
  line = line.replace(/(IDR|Rp)/g,
    '<span style="color:#ffa657">$1</span>');
  // Section headers
  line = line.replace(/(PASS|WARN|OK|✓)/g,
    '<span style="color:#3fb950; font-weight:bold">$1</span>');
  line = line.replace(/(FAIL|ERROR|✗)/g,
    '<span style="color:#f85149; font-weight:bold">$1</span>');
  return line;
}}

function addLine(text) {{
  const span = document.createElement('span');
  span.className = 'line';
  span.innerHTML = colorize(text);
  term.appendChild(span);
  window.scrollTo(0, document.body.scrollHeight);
}}

function run() {{
  if (idx >= lines.length) {{
    // Add blinking cursor at end
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    term.appendChild(cursor);
    return;
  }}
  addLine(lines[idx]);
  idx++;
  // Variable speed: slower for section headers, faster for data rows
  const line = lines[idx - 1];
  let delay = 35;
  if (line.includes('──') || line.includes('══') || line.trim() === '') delay = 15;
  else if (line.includes('Running') || line.includes('Loading') || line.includes('Backtest')) delay = 120;
  else if (line.includes('│')) delay = 25;
  setTimeout(run, delay);
}}

// Start after short pause
setTimeout(run, 800);
</script>
</body>
</html>"""

CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

def make_video_playwright(html_path: Path, output_path: Path):
    """Record the terminal animation using Playwright."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROMIUM_PATH,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        context = browser.new_context(
            viewport={'width': 960, 'height': 680},
            record_video_dir=str(output_path.parent),
            record_video_size={'width': 960, 'height': 680},
        )
        page = context.new_page()
        page.goto(f"file://{html_path}", wait_until='networkidle')

        # Wait for animation to complete (roughly: n_lines * avg_delay)
        page.wait_for_timeout(1000)  # initial pause
        n_lines = 80
        page.wait_for_timeout(n_lines * 45 + 3000)  # wait for lines + buffer

        # Take final screenshot too
        page.screenshot(path=str(SCREENSHOTS_DIR / "demo_final.png"), full_page=False)

        context.close()
        browser.close()

    # Playwright saves video with a random name in the dir; find it
    import glob
    videos = glob.glob(str(output_path.parent / "*.webm"))
    if videos:
        video_path = Path(sorted(videos)[-1])
        video_path.rename(output_path)
        return True
    return False

def webm_to_mp4(webm_path: Path, mp4_path: Path):
    """Convert WebM to MP4 using imageio-ffmpeg."""
    import imageio
    import numpy as np

    reader = imageio.get_reader(str(webm_path))
    fps = reader.get_meta_data().get('fps', 25)
    writer = imageio.get_writer(str(mp4_path), fps=fps, codec='libx264',
                                 quality=8, macro_block_size=None)
    for frame in reader:
        writer.append_data(frame)
    writer.close()
    reader.close()

def main():
    print("Running backtester CLI to capture output...")
    stdout, stderr, rc = run_cli_capture()

    if rc != 0 and not stdout:
        print(f"CLI failed (rc={rc}):\n{stderr}", file=sys.stderr)
        sys.exit(1)

    # Use plain text output for display (Rich output has ANSI codes)
    raw = stdout if stdout else stderr
    plain = strip_ansi(raw)
    lines = plain.split('\n')

    print(f"Captured {len(lines)} lines of output")

    # Write HTML
    html_path = SCREENSHOTS_DIR / "demo.html"
    html_path.write_text(build_html_terminal(lines))
    print(f"HTML written to {html_path}")

    # Record video
    webm_path = SCREENSHOTS_DIR / "demo.webm"
    mp4_path = SCREENSHOTS_DIR / "demo.mp4"

    print("Recording video with Playwright...")
    success = make_video_playwright(html_path, webm_path)

    if success and webm_path.exists():
        print(f"WebM saved: {webm_path}")
        print("Converting to MP4...")
        webm_to_mp4(webm_path, mp4_path)
        print(f"MP4 saved: {mp4_path}")
    else:
        print("Video recording failed or no output.", file=sys.stderr)

    # Also take an early screenshot
    print("Taking early screenshot...")
    take_screenshot(html_path, SCREENSHOTS_DIR / "early.png", wait_ms=1500)
    print("Taking settled screenshot...")
    take_screenshot(html_path, SCREENSHOTS_DIR / "settled.png", wait_ms=6000)

def take_screenshot(html_path: Path, out_path: Path, wait_ms: int):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROMIUM_PATH,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        page = browser.new_page(viewport={'width': 960, 'height': 680})
        page.goto(f"file://{html_path}", wait_until='networkidle')
        page.wait_for_timeout(wait_ms)
        page.screenshot(path=str(out_path))
        browser.close()

if __name__ == '__main__':
    main()
