#!/usr/bin/env python3
"""
Synthesised soundtrack for the showreel — 15 s, 128 BPM, F minor.
Every hit is placed on the same beat grid as src/reel.js, so sound and picture
lock frame-accurately. Output: dist/soundtrack.wav (48 kHz, 16-bit stereo).

    python3 tools/soundtrack.py
"""
import os
import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
BPM = 128
B = 60 / BPM
BAR = 4 * B
N = int(SR * DUR)
rng = np.random.default_rng(2026)

L = np.zeros(N)
R = np.zeros(N)
# separate buses so the kick can side-chain the music
music_L = np.zeros(N)
music_R = np.zeros(N)
verb_send = np.zeros(N)


def note(name):
    names = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def place(sig, t0, gain=1.0, pan=0.0, bus='main', verb=0.0):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if i0 < 0:
        sig = sig[-i0:]
        i0 = 0
    sig = sig[: N - i0]
    gl = gain * np.cos((pan + 1) * np.pi / 4)
    gr = gain * np.sin((pan + 1) * np.pi / 4)
    if bus == 'main':
        L[i0:i0 + len(sig)] += sig * gl
        R[i0:i0 + len(sig)] += sig * gr
    else:
        music_L[i0:i0 + len(sig)] += sig * gl
        music_R[i0:i0 + len(sig)] += sig * gr
    if verb:
        verb_send[i0:i0 + len(sig)] += sig * gain * verb


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR / 2 - 100) / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def sweep_filter(x, f0, f1, q=4.0, block=256, kind='band'):
    """time-varying state-variable filter (cheap, block-wise coefficient update)"""
    y = np.zeros_like(x)
    low = band = 0.0
    n = len(x)
    for s in range(0, n, block):
        frac = s / max(1, n - 1)
        fc = f0 * (f1 / f0) ** frac
        f = 2 * np.sin(np.pi * min(fc, SR / 6) / SR)
        damp = 1 / q
        seg = x[s:s + block]
        out = np.empty_like(seg)
        for k, v in enumerate(seg):
            low += f * band
            high = v - low - damp * band
            band += f * high
            out[k] = band if kind == 'band' else (low if kind == 'low' else high)
        y[s:s + block] = out
    return y


def env_exp(n, decay):
    return np.exp(-np.arange(n) / SR * decay)


def saw(freq, t, detune=0.0):
    ph = (freq * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


# ─────────────────────────────── instruments
def kick(gain=1.0, pitch=1.0, length=0.45):
    t = tt(length)
    f = 45 * pitch + 150 * pitch * np.exp(-t * 38)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 300) * 0.35
    return np.tanh((body + click) * 1.6) * gain


def clap(gain=1.0):
    t = tt(0.35)
    n = bp(rng.standard_normal(len(t)), 900, 5000)
    e = np.zeros(len(t))
    for d in (0, 0.011, 0.022):
        i = int(d * SR)
        e[i:] += np.exp(-(t[: len(t) - i]) * 60)
    e += np.exp(-t * 14) * 0.5
    return n * e * gain * 0.6


def hat(gain=1.0, open_=False):
    t = tt(0.25 if open_ else 0.06)
    n = hp(rng.standard_normal(len(t)), 7500, 4)
    return n * np.exp(-t * (18 if open_ else 70)) * gain * 0.5


def pluck(freq, gain=1.0, decay=7.0, length=0.6, bright=4000, shape='tri'):
    t = tt(length)
    if shape == 'tri':
        x = 2 * np.abs(saw(freq, t)) - 1
    elif shape == 'sine':
        x = np.sin(2 * np.pi * freq * t)
    else:
        x = saw(freq, t)
    x = lp(x, bright)
    a = np.minimum(1, t / 0.003)
    return x * a * np.exp(-t * decay) * gain


def bell(freq, gain=1.0, length=1.2):
    t = tt(length)
    x = (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 6)
         + 0.25 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t * 12))
    return x * np.exp(-t * 4) * np.minimum(1, t / 0.002) * gain * 0.4


def blip(f0, f1, length=0.08, gain=1.0):
    t = tt(length)
    f = f0 * (f1 / f0) ** (t / length)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (4 / length)) * np.minimum(1, t / 0.002) * gain


def tick(gain=1.0, freq=3200):
    t = tt(0.018)
    return (np.sin(2 * np.pi * freq * t) * 0.6 + hp(rng.standard_normal(len(t)), 4000) * 0.4) * np.exp(-t * 300) * gain


def whoosh(length, f0, f1, gain=1.0, q=2.5, shape='rise'):
    n = rng.standard_normal(int(length * SR))
    y = sweep_filter(n, f0, f1, q=q)
    t = np.arange(len(n)) / len(n)
    e = t ** 2.2 if shape == 'rise' else (np.sin(np.pi * t) ** 1.5 if shape == 'swell' else (1 - t) ** 2.5)
    return y * e * gain


def boom(gain=1.0, length=1.6):
    t = tt(length)
    f = 32 + 60 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    n = lp(rng.standard_normal(len(t)), 900) * np.exp(-t * 9) * 0.6
    return np.tanh((s + n) * 1.8) * gain


def crash(gain=1.0, length=2.2):
    t = tt(length)
    n = hp(rng.standard_normal(len(t)), 3000)
    return n * np.exp(-t * 2.2) * gain * 0.35


def reverse_swell(length, gain=1.0):
    c = crash(1.0, length)[::-1]
    return c * gain


def stab(freqs, length, gain=1.0, cutoff=2400):
    t = tt(length)
    x = sum(saw(f, t, d) for f in freqs for d in (-0.006, 0.0, 0.007))
    x = lp(x, cutoff, 2)
    return x * np.minimum(1, t / 0.005) * np.exp(-t * 1.4) * gain / (3 * len(freqs))


def pad(freqs, length, gain=1.0, cutoff=1400):
    t = tt(length)
    xl = sum(saw(f, t, -0.004) + saw(f, t, 0.009) for f in freqs)
    xr = sum(saw(f, t, 0.004) + saw(f, t, -0.011) for f in freqs)
    a = np.minimum(1, t / 0.12) * np.minimum(1, (length - t) / 0.15)
    xl = lp(xl, cutoff) * a * gain / (2 * len(freqs))
    xr = lp(xr, cutoff) * a * gain / (2 * len(freqs))
    return xl, xr


def place_st(xl, xr, t0, gain=1.0, bus='music'):
    place(xl, t0, gain, -0.9, bus)
    place(xr, t0, gain, 0.9, bus)


# ─────────────────────────────── harmony
CH = {
    'Fm': ['F3', 'Ab3', 'C4', 'Eb4'],
    'Db': ['Db3', 'F3', 'Ab3', 'C4'],
    'Ab': ['Ab2', 'C3', 'Eb3', 'G3'],
    'Eb': ['Eb3', 'G3', 'Bb3', 'D4'],
    'C': ['C3', 'E3', 'G3', 'Bb3'],
}
ROOT = {'Fm': 'F1', 'Db': 'Db2', 'Ab': 'Ab1', 'Eb': 'Eb2', 'C': 'C2'}
# bar index → chord (bars 1..6 = scenes 2..7)
PROG = {1: 'Fm', 2: 'Db', 3: 'Ab', 4: 'Eb', 5: 'Fm', 6: 'Db'}

# ═══════════════════════════════ BAR 0 — IGNITE
for i, ch in enumerate('Everything starts with a dot.'):
    if ch != ' ':
        place(tick(0.10, 2600 + 400 * (i % 3)), 0.12 + i * (0.83 / 29), pan=0.3)
for i, (bt, nm) in enumerate([(1, 'F4'), (2, 'Ab4'), (2.5, 'C5'), (2.75, 'F5')]):
    place(blip(note(nm) * 1.5, note(nm), 0.14, 0.32 - i * 0.05), bt * B, verb=0.25)
    place(kick(0.55 - i * 0.12, 1.3), bt * B)
place(blip(300, 1900, 0.13, 0.18), 2.8 * B)                       # anticipation whine
place(kick(1.0, 0.9), 3 * B)                                       # POP
place(boom(0.8, 1.2), 3 * B, verb=0.3)
place(clap(1.0), 3 * B, verb=0.4)
place(crash(0.5, 1.4), 3 * B)
place(whoosh(0.42, 300, 6000, 0.55, shape='rise'), 3 * B + 0.04)  # circle wipe
place(reverse_swell(0.5, 0.35), BAR - 0.5)
place(pad([note('F2'), note('C3')], BAR, 0.16, 500)[0], 0, bus='music')

# ═══════════════════════════════ GROOVE (bars 1..6)
for bar in range(1, 7):
    t0 = bar * BAR
    chord = PROG[bar]
    beats = [0, 1, 2, 3]
    for b in beats:
        if bar == 6 and b == 3:
            continue
        place(kick(1.0), t0 + b * B)
    for b in beats:  # off-beat open hats
        if bar == 6 and b == 3:
            continue
        place(hat(0.55, True), t0 + (b + 0.5) * B, pan=0.25)
    if bar >= 2:
        for b in (1, 3):
            if bar == 6 and b == 3:
                continue
            place(clap(0.7), t0 + b * B, pan=-0.05, verb=0.2)
    if bar >= 3:
        for s in range(16):
            if bar == 6 and s >= 12:
                continue
            if s % 2 == 1:
                place(hat(0.25 + 0.1 * (s % 4 == 3)), t0 + s * B / 4, pan=-0.35)
    # bass — rolling off-beat 8ths with sub
    rf = note(ROOT[chord])
    for b in range(4):
        if bar == 6 and b == 3:
            continue
        for off, g in ((0.5, 1.0), (0.75, 0.55)):
            t = tt(B * 0.22)
            x = lp(saw(rf * 2, t) + 0.6 * np.sin(2 * np.pi * rf * t), 420 + 300 * (bar / 6))
            x *= np.minimum(1, t / 0.004) * np.exp(-t * 9)
            place(x, t0 + (b + off) * B, 0.55 * g, bus='music')
    # pad
    xl, xr = pad([note(n) for n in CH[chord]], BAR if bar < 6 else 3 * B, 0.33, 900 + bar * 180)
    if bar == 6:
        cl, cr = pad([note(n) for n in CH['C']], B, 0.33, 2200)
        place_st(cl, cr, t0 + 3 * B)
    place_st(xl, xr, t0)

# ═══════════════════════════════ BAR 1 — KINETIC TYPE
t0 = BAR
place(boom(0.45, 0.6), t0)
place(whoosh(0.18, 2000, 8000, 0.25, q=1.5, shape='decay'), t0 + B)            # THINGS flip
place(reverse_swell(0.4, 0.4), t0 + 2 * B - 0.4)
place(boom(1.0, 1.0), t0 + 2 * B, verb=0.25)                                   # MOVE. slam
place(crash(0.45, 1.0), t0 + 2 * B)
for i, (f0, f1) in enumerate([(220, 110), (300, 900), (900, 300), (500, 700), (1200, 1800)]):
    place(blip(f0, f1, 0.12, 0.22), t0 + 3 * B + i * 0.035, pan=-0.6 + i * 0.3)
for k in range(3):
    place(blip(1600, 2400, 0.05, 0.12), t0 + 3 * B + 0.14 + k * 0.24 * np.exp(-k * 0.3), pan=0.5)
place(whoosh(0.24, 400, 5000, 0.5, shape='swell'), t0 + 3.5 * B)                 # band wipe

# ═══════════════════════════════ BAR 2 — TIMING
t0 = 2 * BAR
for i in range(5):
    place(tick(0.25, 1800 + i * 300), t0 + 0.12 + i * 0.05, pan=-0.4 + i * 0.2)
for i in range(5):
    place(tick(0.18, 4000), t0 + 0.3 + i * 0.05, pan=0.4)
# sonified easing curve — pitch follows cubic-bezier(.83,0,.17,1)
t = tt(2 * B)
q = t / (2 * B)


def sig_curve(x):
    x1, y1, x2, y2 = 0.83, 0, 0.17, 1
    s = np.linspace(0, 1, 2001)
    bx = 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s ** 2 * x2 + s ** 3
    by = 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s ** 2 * y2 + s ** 3
    return np.interp(x, bx, by)


f = 330 * 2 ** (2 * sig_curve(q))
tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
tone *= np.minimum(1, t / 0.05) * np.minimum(1, (2 * B - t) / 0.05)
place(tone, t0 + B, 0.11, pan=0.0, verb=0.3)
place(whoosh(0.47, 6000, 200, 0.4, shape='rise'), t0 + 3 * B)                  # balls converge
place(reverse_swell(0.45, 0.3), t0 + 4 * B - 0.45)

# ═══════════════════════════════ BAR 3 — DEPTH
t0 = 3 * BAR
place(boom(0.6, 1.0), t0, verb=0.3)
for i in range(12):
    place(bell(note('F6') * [1, 1.189, 1.498, 1.782][i % 4], 0.12, 0.6), t0 + i * 0.03, pan=np.sin(i) * 0.8, verb=0.4)
for b in (1, 2, 3):
    place(whoosh(0.4, 200, 3500, 0.42, q=3, shape='swell'), t0 + b * B - 0.1, pan=(-1) ** b * 0.4)
place(whoosh(0.26, 300, 9000, 0.5, shape='rise'), t0 + 3.45 * B)               # spin wipe

# ═══════════════════════════════ BAR 4 — RHYTHM
t0 = 4 * BAR
penta = ['F5', 'Ab5', 'Bb5', 'C6', 'Eb6', 'F6', 'Ab6']
for s in range(12):
    nm = penta[(s * 3) % len(penta)]
    place(pluck(note(nm), 0.14, 10, 0.35, 5000), t0 + s * B / 4, pan=((s % 4) - 1.5) / 2, bus='music', verb=0.2)
for bt, chord in ((1, ['Eb5', 'G5', 'Bb5']), (2, ['G5', 'Bb5', 'D6']), (2.5, ['Bb5', 'D6', 'F6']), (2.75, ['D6', 'F6', 'G6'])):
    for k, nm in enumerate(chord):
        place(bell(note(nm), 0.18, 1.0), t0 + bt * B + k * 0.012, pan=-0.5 + k * 0.5, verb=0.5)
for k in range(24):
    place(tick(0.13, 2000 + k * 120), t0 + 3 * B + (k / 24) * 0.42, pan=-0.8 + k / 15)

# ═══════════════════════════════ BAR 5 — DATA
t0 = 5 * BAR
for i in range(4):                                        # counters
    st = 0.15 + i * 0.07
    for k in range(18):
        x = k / 18
        tk = st + 0.75 * (np.log2(1 / (1 - x * 0.999)) / 10)
        place(tick(0.09, 3000 + i * 500), t0 + tk, pan=-0.6 + i * 0.4)
    place(blip(note('C6'), note('C6'), 0.12, 0.14), t0 + st + 0.45, pan=-0.6 + i * 0.4, verb=0.3)
for i in range(32):                                       # energy map bars
    place(blip(500 + i * 40, 520 + i * 40, 0.03, 0.06), t0 + 0.25 + i * 0.012, pan=-0.9 + i / 17)
place(whoosh(0.47, 150, 2500, 0.45, shape='rise'), t0 + 3 * B)
place(boom(0.35, 0.5), t0 + 4 * B - 0.02)

# ═══════════════════════════════ BAR 6 — PARTICLES + MONTAGE
t0 = 6 * BAR
for i in range(60):                                       # shimmer
    tt0 = t0 + rng.random() * 1.3
    place(pluck(note(penta[rng.integers(len(penta))]) * 2, 0.05, 14, 0.2, 9000, 'sine'), tt0, pan=rng.uniform(-1, 1), verb=0.5)
place(whoosh(1.3, 200, 7000, 0.45, q=5, shape='rise'), t0 + 3 * B - 1.3)          # riser to formation
place(kick(1.0), t0 + 3 * B)
place(boom(0.7, 0.6), t0 + 3 * B)
# stutter roll under the montage cuts
cuts = [3.0, 3.25, 3.5, 3.625, 3.75, 3.875]
for c in cuts:
    place(kick(0.7, 1.2, 0.12), t0 + c * B)
    place(hp(rng.standard_normal(int(0.05 * SR)), 1500) * np.exp(-tt(0.05) * 60) * 0.35, t0 + c * B, pan=rng.uniform(-0.7, 0.7))
for k in range(16):
    place(clap(0.25 + k * 0.03), t0 + 3 * B + k * B / 16, pan=(-1) ** k * 0.3)
place(reverse_swell(0.6, 0.6), 7 * BAR - 0.6)
place(blip(200, 3000, 0.45, 0.12), 7 * BAR - 0.45)

# ═══════════════════════════════ BAR 7 — END CARD
t0 = 7 * BAR
place(kick(1.2, 0.85, 0.6), t0)
place(boom(1.2, 2.0), t0, verb=0.4)
place(crash(0.8, 2.6), t0)
sl = stab([note(n) for n in ('F2', 'C3', 'F3', 'Ab3', 'C4', 'Eb4', 'G4')], 1.6, 1.1, 3000)
place(sl, t0, 0.8, pan=-0.2, bus='music', verb=0.5)
place(sl, t0 + 0.012, 0.8, pan=0.2, bus='music', verb=0.5)
for i in range(6):                                        # letter landings
    place(tick(0.22, 1500 + i * 180), t0 + 0.02 + i * 0.035 + 0.25, pan=-0.5 + i * 0.2)
place(bell(note('C6'), 0.22, 1.6), t0 + 0.62, verb=0.6)
place(bell(note('G6'), 0.14, 1.4), t0 + 0.7, verb=0.6)
# CRT power-off
tc = t0 + 3 * B
place(tick(0.6, 900), tc)
t = tt(0.32)
f = 1400 * np.exp(-t * 14) + 40
place(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6), tc, 0.45)
place(hp(rng.standard_normal(int(0.2 * SR)), 2500) * np.exp(-tt(0.2) * 25) * 0.25, tc + 0.1)
place(blip(1800, 1700, 0.12, 0.12), tc + 0.24, verb=0.5)

# ─────────────────────────────── side-chain, reverb, master
kick_times = [b * B for b in range(4, 27)] + [7 * BAR]
duck = np.ones(N)
for kt in kick_times:
    i = int(kt * SR)
    n = min(N - i, int(B * SR))
    if n <= 0:
        continue
    x = np.arange(n) / SR
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.75 * np.exp(-x * 9))
L += music_L * duck
R += music_R * duck

# algorithmic plate: exponentially decaying stereo noise IR
ir_len = int(1.8 * SR)
x = np.arange(ir_len) / SR
irL = rng.standard_normal(ir_len) * np.exp(-x * 3.2)
irR = rng.standard_normal(ir_len) * np.exp(-x * 3.2)
irL = lp(irL, 6000); irR = lp(irR, 6000)
irL /= np.sqrt(np.sum(irL ** 2)); irR /= np.sqrt(np.sum(irR ** 2))
vs = hp(verb_send, 250)
L += signal.fftconvolve(vs, irL)[:N] * 0.5
R += signal.fftconvolve(vs, irR)[:N] * 0.5

# glue: gentle high shelf, soft clip, fade
mix = np.stack([L, R])
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 1.6
mix = np.tanh(mix) / np.tanh(1.6)
fade = np.ones(N)
fo = int(0.06 * SR)
fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade
mix = mix / np.max(np.abs(mix)) * 0.93

out = os.path.join(os.path.dirname(__file__), '..', 'dist', 'soundtrack.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
from scipy.io import wavfile
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', os.path.abspath(out))
