# PRD — Ambient Noise Blender

## Overview
A browser-based soundscape mixer that lets users blend multiple procedurally generated noise sources into a custom ambient audio environment. No audio files, no backend — entirely self-contained via the Web Audio API.

## Problem
Focus work, sleep, and relaxation are disrupted by environmental noise or uncomfortable silence. Purpose-built apps are locked behind subscriptions or native installs. A lightweight, zero-install browser tool solves this immediately.

## Goals
- Provide 5–6 distinct ambient noise "channels" with independent volume control
- Animate a live visualizer that responds to the current mix
- Include a fade-out sleep timer
- Work entirely offline after first load (no external assets)
- Be visually polished and immediately satisfying to use

## Non-Goals
- No user accounts or persistence beyond sessionStorage
- No playlist or recording features
- No mobile-native features (PWA/service worker are out of scope)

## Noise Channels
| Channel | Web Audio approach |
|---|---|
| White Noise | BufferSource filled with `Math.random()` |
| Brown Noise | Integrated white noise (leaky integrator) |
| Rain | Filtered white noise with low-pass at ~600 Hz |
| Ocean Waves | LFO-modulated band-pass filtered noise |
| Café Chatter | Multiple short random-pitch oscillators burst-firing |
| Fireplace | Low-pass brown noise + occasional crackle clicks |

## UI Components
1. **Header** — app name, tagline
2. **Channel Cards** — one card per noise source with: icon, label, vertical volume slider, animated waveform ring
3. **Master Volume** — horizontal slider affecting all channels
4. **Sleep Timer** — dropdown (Off / 15 min / 30 min / 60 min) with countdown display
5. **Visualizer Bar** — horizontal spectrum-style bars at the bottom, driven by AnalyserNode

## Visual Design
- Dark theme: deep navy/charcoal background
- Each channel card has a distinct accent color
- Smooth, glowing animated ring around each card's icon that pulses with volume
- Responsive grid: 2 columns on mobile, 3 on tablet, 6 on desktop

## Technical Stack
- Vanilla HTML5 / CSS3 / ES Modules (no build tools)
- Web Audio API: OscillatorNode, AudioBufferSourceNode, BiquadFilterNode, GainNode, AnalyserNode, DynamicsCompressorNode
- Single `index.html` file (styles and scripts inline for zero-dependency deployment)

## Acceptance Criteria
- [ ] All 6 channels produce distinct, recognizable sounds
- [ ] Sliders smoothly adjust volume with no audio glitches (using `setTargetAtTime`)
- [ ] Sleep timer counts down visibly and fades audio to silence over 30 s
- [ ] Visualizer reacts in real time to mix changes
- [ ] Works in Chrome, Firefox, and Safari (latest)
- [ ] Page loads under 50 KB (no external assets)
