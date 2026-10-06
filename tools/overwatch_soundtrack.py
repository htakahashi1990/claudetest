#!/usr/bin/env python3
"""
Soundtrack for the OVERWATCH fan concept promo — 24 s, 120 BPM, D minor → D major.
Every hit is placed on the same timeline as src/overwatch.js (gunshots, countdown
beeps, spawn doors, lock-ons, explosions, slams).
Output: dist/overwatch-soundtrack.wav (48 kHz, 16-bit stereo).

    python3 tools/overwatch_soundtrack.py
"""
import os
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))
import synth as S  # noqa: E402

DUR = 24.0
B = 0.5
BAR = 2.0
S.init(DUR, seed=76)
SR, tt, place, note = S.SR, S.tt, S.place, S.note
rng = np.random.default_rng(76)
KICKS = []


def K(t, g=1.0, pitch=1.0, length=0.45, duck=True):
    place(S.kick(g, pitch, length), t)
    if duck:
        KICKS.append(t)


def noise(d):
    return rng.standard_normal(int(d * SR))


# ─────────────────────────────── new instruments
def gunshot(gain=1.0):
    t = tt(0.4)
    n = rng.standard_normal(len(t))
    crack = S.bp(n, 900, 9000) * np.exp(-t * 45)
    f = 55 + 140 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    zap = np.sin(2 * np.pi * np.cumsum(600 + 2200 * np.exp(-t * 60)) / SR) * np.exp(-t * 40) * 0.35
    click = S.hp(n, 5000) * np.exp(-t * 400) * 0.5
    tail = S.lp(n, 2500) * np.exp(-t * 6) * 0.15
    return np.tanh((crack * 0.9 + body * 1.2 + zap + click + tail) * 1.5) * gain


def pew(gain=1.0):
    return S.lp(gunshot(1.0), 2200) * 0.6 * gain


def explosion(gain=1.0):
    t = tt(2.4)
    x = S.boom(1.0, 2.4) * 1.1
    x += S.lp(rng.standard_normal(len(t)), 3500) * np.exp(-t * 3.5) * 0.6
    crackle = (rng.random(len(t)) < 0.002) * rng.standard_normal(len(t)) * np.exp(-t * 2.5) * 3
    x += S.hp(crackle, 1500)
    return np.tanh(x * 1.3) * gain


def beep(freq, length=0.12, gain=1.0):
    t = tt(length)
    x = np.sign(np.sin(2 * np.pi * freq * t)) * 0.5 + np.sin(2 * np.pi * freq * 2 * t) * 0.2
    return S.lp(x, 6000) * np.minimum(1, t / 0.003) * np.exp(-t * 6 / length) * gain


def ding(gain=1.0):
    return S.bell(note('A6'), gain, 0.6) + np.pad(S.bell(note('E7'), gain * 0.8, 0.6), (int(0.06 * SR), 0))[: int(0.6 * SR)]


def braam(freqs, length, gain=1.0, cutoff=900):
    t = tt(length)
    x = sum(S.saw(f, t, d) for f in freqs for d in (-0.008, -0.002, 0.004, 0.01))
    x = S.lp(x, cutoff, 2) / (4 * len(freqs))
    env = np.minimum(1, t / 0.03) * np.exp(-t * (1.6 / length))
    return np.tanh(x * env * 2.2) * gain


def tom(gain=1.0, f0=110):
    t = tt(0.5)
    f = f0 * 0.55 + f0 * np.exp(-t * 18)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) + S.bp(rng.standard_normal(len(t)), 200, 2000) * np.exp(-t * 30) * 0.3
    return np.tanh(x * 1.5) * gain


def snare(gain=1.0):
    t = tt(0.3)
    x = S.bp(rng.standard_normal(len(t)), 1200, 8000) * np.exp(-t * 18) * 0.8 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.6
    return x * gain


def bass_line(t0, root, bars=1, cutoff=600, gain=0.5):
    f = note(root)
    for k in range(8 * bars):
        t = tt(B * 0.45)
        x = S.lp(S.saw(f, t) + 0.7 * np.sin(2 * np.pi * f / 2 * t), cutoff) * np.minimum(1, t / 0.004) * np.exp(-t * 7)
        place(x, t0 + k * B / 2, gain * (1.0 if k % 2 == 0 else 0.75), bus='music')


def groove(t0, bars=1, full=True):
    for b in range(4 * bars):
        K(t0 + b * B)
        place(S.hat(0.5, True), t0 + (b + 0.5) * B, pan=0.25)
        if b % 2 == 1:
            place(snare(0.8), t0 + b * B, verb=0.25)
        if full:
            for s in range(4):
                place(S.hat(0.22 + 0.08 * (s == 2)), t0 + b * B + s * B / 4, pan=-0.35)


def chord_pad(names, t0, length, gain=0.28, cutoff=1200):
    xl, xr = S.pad([note(n) for n in names], length, gain, cutoff)
    S.place_st(xl, xr, t0)


DM = ['D3', 'F3', 'A3', 'D4']
BB = ['Bb2', 'D3', 'F3', 'Bb3']
CC = ['C3', 'E3', 'G3', 'C4']
DMAJ = ['D3', 'F#3', 'A3', 'D4', 'F#4']
note_map = {'F#': 'Gb'}


def nn(n):
    for k, v in note_map.items():
        n = n.replace(k, v)
    return n


DMAJ = [nn(n) for n in DMAJ]

# ═══════════════ BAR 0 — MATCH FOUND
chord_pad(['D2', 'A2', 'D3'], 0, 2.0, 0.22, 500)
for k in range(8):
    place(S.tick(0.12, 2400), k * 0.125 + 0.05, pan=0.2)
for i in range(10):
    place(S.blip(1500 + i * 120, 1600 + i * 120, 0.03, 0.05), 0.2 + i * 0.035, pan=-0.3)
place(S.whoosh(0.7, 300, 5000, 0.4, shape='rise'), 0.3)
place(S.reverse_swell(0.35, 0.4), 1.0 - 0.35)
K(1.0, 1.1, 0.9)
place(S.boom(0.9, 1.2), 1.0, verb=0.3)
place(S.crash(0.5, 1.6), 1.0)
for k, n in enumerate(['D5', 'F5', 'A5', 'D6']):
    place(S.bell(note(n), 0.2, 1.4), 1.0 + k * 0.03, pan=-0.4 + k * 0.25, verb=0.5)
place(S.stab([note(n) for n in DM], 0.9, 0.6, 2400), 1.0, bus='music', verb=0.4)
place(S.whoosh(0.3, 500, 7000, 0.5, shape='swell'), 1.72)

# ═══════════════ BAR 1 — ROLES
chord_pad(BB, 2.0, 2.0, 0.24, 1000)
for k, t in enumerate([2.0, 2.5, 3.0]):
    place(tom(0.9, 110 - k * 15), t, verb=0.3)
    K(t, 0.8, 1.0)
    place(braam([note(['D2', 'F2', 'A2'][k]), note(['A2', 'C3', 'E3'][k])], 0.5, 0.35, 700), t, bus='music')
    place(S.whoosh(0.15, 3000, 800, 0.2, shape='decay'), t - 0.02, pan=-0.5 + k * 0.5)
for k in range(8):
    place(snare(0.15 + k * 0.06), 3.5 + k * B / 8, pan=(-1) ** k * 0.2)
place(S.whoosh(0.25, 300, 6000, 0.5, shape='rise'), 3.75)

# ═══════════════ BAR 2 — VERSUS
chord_pad(DM, 4.0, 2.0, 0.26, 1100)
bass_line(4.0, 'D2', 1, 500, 0.45)
for b in range(4):
    K(4.0 + b * B)
    place(S.hat(0.35, True), 4.0 + (b + 0.5) * B, pan=0.25)
for k in range(10):
    place(S.whoosh(0.12, 800, 4000, 0.12, shape='decay'), 4.0 + k * 0.055, pan=-0.8 if k % 2 == 0 else 0.8)
place(S.reverse_swell(0.5, 0.4), 5.0 - 0.5)
K(5.0, 1.2, 0.85)
place(S.boom(1.0, 1.4), 5.0, verb=0.3)
place(S.crash(0.5, 1.4), 5.0)
place(braam([note('D2'), note('A2'), note('D3')], 1.0, 0.7, 800), 5.0, bus='music', verb=0.3)
place(S.whoosh(0.5, 200, 9000, 0.55, shape='rise'), 5.5)

# ═══════════════ BAR 3 — SPAWN (setup)
chord_pad(BB, 6.0, 2.0, 0.2, 500)
for b in range(4):
    K(6.0 + b * B, 0.45, 1.0, duck=False)
for t, f in ((6.0, 880), (6.5, 880), (7.0, 880), (7.5, 1760)):
    place(beep(f, 0.14 if f < 1000 else 0.3, 0.32), t)
t = tt(0.8)
place(S.hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 4) * 0.35, 7.5, pan=-0.2)          # hiss
place(S.lp(S.saw(1, t) * 0 + np.sign(np.sin(2 * np.pi * np.cumsum(180 + 220 * t) / SR)), 1600) * np.exp(-t * 3) * 0.12, 7.5)  # servo
place(S.boom(0.5, 0.5), 7.95)
place(S.reverse_swell(0.5, 0.5), 8.0 - 0.5)
for k in range(5):
    place(S.lp(S.kick(0.25, 2.2, 0.08), 900), 7.62 + k * 0.25, pan=(-1) ** k * 0.15)

# ═══════════════ BAR 4 — FIRST ENGAGEMENT
chord_pad(DM, 8.0, 2.0, 0.24, 1500)
groove(8.0, 1)
bass_line(8.0, 'D2', 1, 750, 0.5)
place(S.kick(0.5, 1.6, 0.2), 8.58)                                     # landing
for ts in [8.75, 8.875, 9.0, 9.125, 9.25, 9.5, 9.625, 9.75]:
    place(gunshot(0.85), ts, pan=0.15, verb=0.15)
for td in (9.25, 9.75):
    place(ding(0.35), td + 0.02, verb=0.3)
place(S.whoosh(0.2, 500, 6000, 0.55, shape='rise'), 9.8)

# ═══════════════ BAR 5 — TACTICAL (the moment before)
chord_pad(CC, 10.0, 2.0, 0.22, 700)
for b in range(4):
    K(10.0 + b * B, 0.55, 0.9, duck=False)
for k in range(16):
    place(S.tick(0.14, 3000), 10.0 + k * 0.125, pan=0.3 * (-1) ** k)
for t, f in ((10.5, 660), (11.0, 880), (11.5, 1320)):
    place(beep(f, 0.18, 0.3), t)
place(S.whoosh(1.2, 150, 8000, 0.5, q=5, shape='rise'), 10.8)
place(S.reverse_swell(0.8, 0.6), 12.0 - 0.8)
place(S.blip(200, 2500, 0.4, 0.12), 11.6)

# ═══════════════ BAR 6 — TEAMFIGHT
chord_pad(BB, 12.0, 2.0, 0.26, 1800)
K(12.0, 1.2, 0.85)
place(S.boom(1.0, 1.2), 12.0, verb=0.3)
place(S.crash(0.6, 1.8), 12.0)
place(braam([note('Bb1'), note('F2'), note('Bb2')], 1.2, 0.75, 900), 12.0, bus='music', verb=0.3)
groove(12.0, 1)
bass_line(12.0, 'Bb1', 1, 900, 0.5)
for ti in [12.05, 12.13, 12.21, 12.29, 12.37]:
    place(S.whoosh(0.06, 4000, 1200, 0.25, q=1.5, shape='decay'), ti - 0.03, pan=rng.uniform(-0.6, 0.6))
    place(S.lp(S.kick(0.45, 1.8, 0.12), 1500) + S.bp(noise(0.12), 600, 3000) * np.exp(-tt(0.12) * 40) * 0.4, ti)
for i in range(22):
    ti = 12.0 + i * 0.09 + (np.sin(i * 127.1 + 311.7) * 43758.5453 % 1) * 0.03
    place(pew(0.22), ti, pan=-0.75 if i % 2 else 0.75)
for k, n in enumerate(['D5', 'Gb5', 'A5', 'D6', 'Gb6']):
    place(S.bell(note(n), 0.16, 0.9), 12.5 + k * 0.05, pan=-0.5 + k * 0.25, verb=0.5)
for ts in [13.0, 13.125, 13.25, 13.375]:
    place(gunshot(0.85), ts, pan=0.15, verb=0.15)
place(ding(0.35), 13.4, verb=0.3)
for k, n in enumerate(['A4', 'D5', 'A5', 'D6', 'A6']):
    place(S.pluck(note(n), 0.18, 6, 0.8, 6000, 'sine'), 13.55 + k * 0.04, verb=0.5)
place(S.whoosh(0.4, 2000, 9000, 0.25, shape='swell'), 13.55)

# ═══════════════ BAR 7 — ULTIMATE (slow motion)
place(S.whoosh(0.5, 9000, 200, 0.6, shape='decay'), 14.0)
K(14.0, 1.1, 0.7, 0.8)
place(S.boom(0.8, 1.8), 14.0, verb=0.4)
xl, xr = S.pad([note(n) for n in ['D2', 'A2', 'D3', 'F3']], 1.5, 0.3, 350)
S.place_st(xl, xr, 14.0)
for k in range(3):
    place(S.kick(0.6, 0.7, 0.5), 14.25 + k * 0.38)                     # heartbeat
for k, (lt, n) in enumerate(zip([14.5, 14.625, 14.75, 14.875], ['A5', 'C6', 'D6', 'F6'])):
    place(beep(note(n), 0.1, 0.3), lt, pan=-0.4 + k * 0.27)
for k in range(4):
    place(S.whoosh(0.3, 600, 5000, 0.35, q=2, shape='rise'), 15.25 + k * 0.012, pan=-0.6 + k * 0.4)
place(S.reverse_swell(0.4, 0.5), 15.5 - 0.4)
place(explosion(1.3), 15.5, verb=0.4)
for k in range(4):
    place(explosion(0.35), 15.5 + 0.03 * k, pan=-0.7 + k * 0.45)
place(S.crash(0.7, 2.0), 15.5)
place(S.stab([note(n) for n in ['D3', 'A3', 'D4', 'F4', 'A4']], 0.6, 0.8, 3000), 15.55, bus='music', verb=0.4)
place(S.whoosh(0.25, 400, 9000, 0.5, shape='rise'), 15.75)

# ═══════════════ BAR 8 — NO HERO FIGHTS ALONE.
chord_pad(DM, 16.0, 2.0, 0.26, 1600)
groove(16.0, 1)
bass_line(16.0, 'D2', 1, 900, 0.5)
place(S.boom(0.5, 0.6), 16.0)
place(S.whoosh(0.18, 2000, 8000, 0.25, q=1.5, shape='decay'), 16.5)
place(S.reverse_swell(0.4, 0.4), 17.0 - 0.4)
place(S.boom(1.0, 1.0), 17.0, verb=0.25)
place(S.crash(0.45, 1.0), 17.0)
for i in range(6):
    place(S.blip(400 + i * 90, 700 + i * 90, 0.1, 0.18), 17.5 + i * 0.035, pan=-0.6 + i * 0.24)
place(S.whoosh(0.25, 400, 5000, 0.5, shape='swell'), 17.75)

# ═══════════════ BAR 9 — MONTAGE → VICTORY
for c in [18.0, 18.25, 18.5, 18.625, 18.75, 18.875]:
    K(c, 0.75, 1.2, 0.12)
    place(S.hp(noise(0.05), 1500) * np.exp(-tt(0.05) * 60) * 0.35, c, pan=rng.uniform(-0.7, 0.7))
for k in range(16):
    place(snare(0.2 + k * 0.035), 18.5 + k * 0.5 / 16, pan=(-1) ** k * 0.3)
place(S.reverse_swell(0.6, 0.6), 19.0 - 0.6)
K(19.0, 1.2, 0.85)
place(S.boom(1.1, 1.6), 19.0, verb=0.35)
place(S.crash(0.7, 2.0), 19.0)
fan = [note(n) for n in DMAJ]
place(S.stab(fan, 1.0, 1.1, 3500), 19.0, 0.9, pan=-0.2, bus='music', verb=0.5)
place(S.stab(fan, 1.0, 1.1, 3500), 19.012, 0.9, pan=0.2, bus='music', verb=0.5)
for k, n in enumerate(['D6', 'Gb6', 'A6', 'D7']):
    place(S.bell(note(n), 0.14, 1.2), 19.05 + k * 0.06, pan=-0.6 + k * 0.4, verb=0.6)
place(S.whoosh(0.2, 1000, 9000, 0.4, shape='rise'), 19.8)

# ═══════════════ BARS 10–11 — END CARD
K(20.0, 1.2, 0.85, 0.6)
place(S.boom(1.2, 2.2), 20.0, verb=0.4)
place(S.crash(0.8, 2.8), 20.0)
xl, xr = S.pad([note(n) for n in DMAJ], 3.3, 0.36, 1600)
S.place_st(xl, xr, 20.0)
place(braam([note('D2'), note('A2')], 2.5, 0.5, 600), 20.0, bus='music', verb=0.3)
for k in range(9):
    place(S.tick(0.2, 1500 + k * 150), 20.02 + k * 0.03 + 0.2, pan=-0.6 + k * 0.15)
place(S.blip(600, 1200, 0.12, 0.2), 20.7, verb=0.4)
for b in range(5):
    K(21.0 + b * B, 0.35, 1.0, duck=False)
place(S.bell(note('A5'), 0.18, 1.6), 20.55, verb=0.6)
tc = 23.25
place(S.tick(0.6, 900), tc)
t = tt(0.32)
place(np.sin(2 * np.pi * np.cumsum(1400 * np.exp(-t * 14) + 40) / SR) * np.exp(-t * 6), tc, 0.45)
place(S.hp(noise(0.2), 2500) * np.exp(-tt(0.2) * 25) * 0.25, tc + 0.1)
place(beep(1760, 0.1, 0.18), tc + 0.3, verb=0.5)

# ─────────────────────────────── master
N = S.N
duck = np.ones(N)
for kt in KICKS:
    i = int(kt * SR)
    n = min(N - i, int(B * SR))
    if n <= 0:
        continue
    x = np.arange(n) / SR
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.7 * np.exp(-x * 9))
# slow-motion bar: muffle the music bus
mL, mR = S.music_L.copy(), S.music_R.copy()
a, b = int(14.0 * SR), int(15.5 * SR)
mL[a:b] = S.lp(mL[a:b], 500); mR[a:b] = S.lp(mR[a:b], 500)
L = S.L + mL * duck
R = S.R + mR * duck
ir_len = int(1.8 * SR)
x = np.arange(ir_len) / SR
irL = S.lp(rng.standard_normal(ir_len) * np.exp(-x * 3.2), 6000)
irR = S.lp(rng.standard_normal(ir_len) * np.exp(-x * 3.2), 6000)
irL /= np.sqrt(np.sum(irL ** 2)); irR /= np.sqrt(np.sum(irR ** 2))
vs = S.hp(S.verb_send, 250)
L = L + signal.fftconvolve(vs, irL)[:N] * 0.5
R = R + signal.fftconvolve(vs, irR)[:N] * 0.5
mix = np.stack([L, R])
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 1.6
mix = np.tanh(mix) / np.tanh(1.6)
fo = int(0.15 * SR)
mix[:, -fo:] *= np.linspace(1, 0, fo)
mix = mix / np.max(np.abs(mix)) * 0.93
out = os.path.join(os.path.dirname(__file__), '..', 'dist', 'overwatch-soundtrack.wav')
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', os.path.abspath(out))
