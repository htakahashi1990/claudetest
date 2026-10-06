"""
Shared synthesis toolkit (instruments, filters, mix buses) for the
soundtracks in this repo. Call init(duration) before placing sounds.
"""
import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(2026)
N = 0
L = R = music_L = music_R = verb_send = None


def init(dur, seed=2026):
    """allocate the mix buses for a piece of `dur` seconds"""
    global N, L, R, music_L, music_R, verb_send, rng
    N = int(SR * dur)
    L, R = np.zeros(N), np.zeros(N)
    music_L, music_R = np.zeros(N), np.zeros(N)  # side-chained bus
    verb_send = np.zeros(N)
    rng = np.random.default_rng(seed)


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


