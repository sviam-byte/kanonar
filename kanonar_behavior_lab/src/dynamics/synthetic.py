"""Synthetic dynamical systems with known correlation dimension / regime type.

Each generator returns a SyntheticSystem carrying:
  - data:       (N, dim) trajectory in native state space
  - observable: (N,) scalar observable for delay-embedding tests
  - known_d2:   textbook correlation dimension (None when not well-defined)
  - regime:     'fixed_point' | 'limit_cycle' | 'chaotic' | 'stochastic'

References for known_d2: Grassberger & Procaccia (1983), Sprott (2003).
All randomness is seeded so the battery is reproducible.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

DEFAULT_SEED = 20260618


@dataclass(frozen=True)
class SyntheticSystem:
    name: str
    data: np.ndarray
    observable: np.ndarray
    known_d2: float | None
    regime: str


# --- continuous flows (RK4) -------------------------------------------------


def _rk4(deriv, state: np.ndarray, dt: float, n: int, transient: int) -> np.ndarray:
    out = np.empty((n, state.size))
    s = state.astype(float).copy()
    for _ in range(transient):
        k1 = deriv(s)
        k2 = deriv(s + 0.5 * dt * k1)
        k3 = deriv(s + 0.5 * dt * k2)
        k4 = deriv(s + dt * k3)
        s = s + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
    for i in range(n):
        k1 = deriv(s)
        k2 = deriv(s + 0.5 * dt * k1)
        k3 = deriv(s + 0.5 * dt * k2)
        k4 = deriv(s + dt * k3)
        s = s + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
        out[i] = s
    return out


def lorenz(n: int = 6000, dt: float = 0.01, sigma: float = 10.0, rho: float = 28.0,
           beta: float = 8.0 / 3.0) -> SyntheticSystem:
    def deriv(s):
        x, y, z = s
        return np.array([sigma * (y - x), x * (rho - z) - y, x * y - beta * z])

    data = _rk4(deriv, np.array([1.0, 1.0, 1.0]), dt, n, transient=5000)
    return SyntheticSystem("lorenz", data, data[:, 0].copy(), 2.06, "chaotic")


def rossler(n: int = 6000, dt: float = 0.05, a: float = 0.2, b: float = 0.2,
            c: float = 5.7) -> SyntheticSystem:
    def deriv(s):
        x, y, z = s
        return np.array([-y - z, x + a * y, b + z * (x - c)])

    data = _rk4(deriv, np.array([1.0, 1.0, 1.0]), dt, n, transient=5000)
    return SyntheticSystem("rossler", data, data[:, 0].copy(), 1.99, "chaotic")


# --- discrete maps ----------------------------------------------------------


def henon(n: int = 6000, a: float = 1.4, b: float = 0.3) -> SyntheticSystem:
    transient = 1000
    x, y = 0.1, 0.1
    data = np.empty((n, 2))
    for _ in range(transient):
        x, y = 1.0 - a * x * x + y, b * x
    for i in range(n):
        x, y = 1.0 - a * x * x + y, b * x
        data[i] = (x, y)
    return SyntheticSystem("henon", data, data[:, 0].copy(), 1.22, "chaotic")


def logistic(n: int = 6000, r: float = 4.0, seed: int = DEFAULT_SEED) -> SyntheticSystem:
    rng = np.random.default_rng(seed)
    x = rng.uniform(0.05, 0.95)
    for _ in range(1000):
        x = r * x * (1.0 - x)
    series = np.empty(n)
    for i in range(n):
        x = r * x * (1.0 - x)
        series[i] = x
    data = series[:, None]
    # At r=4 the chaotic attractor fills the interval: correlation dimension ~= 1.
    return SyntheticSystem("logistic_r4", data, series, 1.0, "chaotic")


# --- controls ---------------------------------------------------------------


def periodic(n: int = 6000, period: float = 50.0) -> SyntheticSystem:
    t = np.arange(n)
    series = np.sin(2.0 * np.pi * t / period)
    # Embedded, a closed limit cycle is a 1-D curve -> correlation dimension ~= 1.
    return SyntheticSystem("periodic", series[:, None], series, 1.0, "limit_cycle")


def ar1(n: int = 6000, phi: float = 0.5, sigma: float = 1.0,
        seed: int = DEFAULT_SEED) -> SyntheticSystem:
    rng = np.random.default_rng(seed + 1)
    series = np.empty(n)
    x = 0.0
    for i in range(n):
        x = phi * x + sigma * rng.standard_normal()
        series[i] = x
    # Stochastic: no low-dim attractor; dimension fills the embedding space.
    return SyntheticSystem("ar1", series[:, None], series, None, "stochastic")


def white_noise(n: int = 6000, dim: int = 3, seed: int = DEFAULT_SEED) -> SyntheticSystem:
    rng = np.random.default_rng(seed + 2)
    data = rng.standard_normal((n, dim))
    return SyntheticSystem("white_noise", data, data[:, 0].copy(), None, "stochastic")


# --- linear-rank Gaussians (participation-ratio anchors) --------------------


def gaussian_blob(n: int = 6000, rank: int = 5, ambient: int = 8,
                  seed: int = DEFAULT_SEED) -> np.ndarray:
    """Isotropic Gaussian on a `rank`-dim subspace of `ambient` space.

    Linear effective dimension (participation ratio) ~= rank.
    """
    rng = np.random.default_rng(seed + 3 + rank)
    latent = rng.standard_normal((n, rank))
    basis, _ = np.linalg.qr(rng.standard_normal((ambient, rank)))
    return latent @ basis.T


def battery() -> list[SyntheticSystem]:
    """The frozen calibration battery (correlation-dimension anchors)."""
    return [lorenz(), rossler(), henon(), logistic(), periodic(), ar1(), white_noise()]
