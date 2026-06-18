"""The frozen d_eff estimator.

Two complementary effective-dimension measures, plus the delay-embedding
machinery the nonlinear one needs when applied to a scalar observable:

  - participation_ratio:   LINEAR d_eff = (sum lambda)^2 / sum(lambda^2) over
                           the covariance spectrum. Cheap, robust, calibrated
                           on Gaussian blobs of known rank.
  - correlation_dimension: NONLINEAR d_eff via Grassberger-Procaccia: slope of
                           log C(r) vs log r in the scaling region, with a
                           Theiler window to discount temporally-correlated
                           pairs. Calibrated on Lorenz/Henon/etc.

The constants below ARE the estimator. They are fixed here (pre-registration)
and must not be retuned per target system; calibrate.py checks them against
known answers.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# --- frozen estimator parameters --------------------------------------------

EMBEDDING_DIM = 10          # Takens embedding dimension for scalar observables
THEILER_WINDOW = 10         # exclude pairs with |i - j| <= THEILER_WINDOW
GP_MAX_POINTS = 4000        # cap on points used for pairwise distances
GP_LO_PCTL = 1.0            # scaling-region lower bound (percentile of distances)
GP_HI_PCTL = 15.0           # scaling-region upper bound
GP_N_RADII = 24             # log-spaced radii across the scaling region
# Window (1, 15) chosen by joint calibration over the synthetic battery
# (calibrate.py): minimizes total |D2 - known| across Lorenz/Rossler/Henon/
# logistic. Favoring small radii reduces large-r saturation bias, since the
# correlation dimension is defined in the r -> 0 limit. Frozen here.


def participation_ratio(data: np.ndarray) -> float:
    """Linear effective dimension from the covariance spectrum."""
    x = np.asarray(data, dtype=float)
    if x.ndim == 1:
        return 1.0
    xc = x - x.mean(axis=0, keepdims=True)
    cov = np.cov(xc, rowvar=False)
    cov = np.atleast_2d(cov)
    ev = np.linalg.eigvalsh(cov)
    ev = ev[ev > 1e-12]
    if ev.size == 0:
        return 0.0
    return float(ev.sum() ** 2 / np.square(ev).sum())


def autocorr_delay(series: np.ndarray, max_lag: int = 200) -> int:
    """Embedding delay tau = first lag where autocorrelation drops below 1/e."""
    x = np.asarray(series, dtype=float)
    x = x - x.mean()
    var = float(x @ x)
    if var <= 0:
        return 1
    n = x.size
    threshold = 1.0 / np.e
    upper = min(max_lag, n - 1)
    for lag in range(1, upper + 1):
        ac = float(x[: n - lag] @ x[lag:]) / var
        if ac < threshold:
            return lag
    return max(1, upper)


def time_delay_embedding(series: np.ndarray, dim: int = EMBEDDING_DIM,
                         tau: int | None = None) -> np.ndarray:
    """Takens delay embedding of a scalar observable into (N', dim)."""
    x = np.asarray(series, dtype=float).ravel()
    if tau is None:
        tau = autocorr_delay(x)
    span = (dim - 1) * tau
    rows = x.size - span
    if rows <= 0:
        raise ValueError(f"series too short for dim={dim}, tau={tau}")
    return np.column_stack([x[i * tau: i * tau + rows] for i in range(dim)])


def _pairwise_distances_theiler(data: np.ndarray, theiler: int) -> np.ndarray:
    """Euclidean distances over all pairs with |i - j| > theiler (time order kept)."""
    n = len(data)
    chunks: list[np.ndarray] = []
    for i in range(n - theiler - 1):
        diff = data[i + theiler + 1:] - data[i]
        chunks.append(np.sqrt(np.einsum("ij,ij->i", diff, diff)))
    if not chunks:
        return np.empty(0)
    return np.concatenate(chunks)


@dataclass
class CorrDimResult:
    d2: float
    r_lo: float
    r_hi: float
    log_radii: np.ndarray = field(repr=False)
    log_counts: np.ndarray = field(repr=False)
    n_pairs: int = 0


def correlation_dimension(
    data: np.ndarray,
    theiler: int = THEILER_WINDOW,
    lo_pctl: float = GP_LO_PCTL,
    hi_pctl: float = GP_HI_PCTL,
    n_radii: int = GP_N_RADII,
    max_points: int = GP_MAX_POINTS,
) -> CorrDimResult:
    """Grassberger-Procaccia correlation dimension on a native trajectory."""
    x = np.asarray(data, dtype=float)
    if x.ndim == 1:
        x = x[:, None]
    if len(x) > max_points:
        x = x[:max_points]

    dists = _pairwise_distances_theiler(x, theiler)
    dists = dists[dists > 0]
    if dists.size < 100:
        return CorrDimResult(float("nan"), 0.0, 0.0, np.empty(0), np.empty(0), int(dists.size))

    sd = np.sort(dists)
    r_lo = float(np.percentile(sd, lo_pctl))
    r_hi = float(np.percentile(sd, hi_pctl))
    if not (r_hi > r_lo > 0):
        return CorrDimResult(float("nan"), r_lo, r_hi, np.empty(0), np.empty(0), int(sd.size))

    radii = np.geomspace(r_lo, r_hi, n_radii)
    counts = np.searchsorted(sd, radii, side="right").astype(float) / sd.size
    mask = counts > 0
    log_r = np.log(radii[mask])
    log_c = np.log(counts[mask])
    if log_r.size < 2:
        return CorrDimResult(float("nan"), r_lo, r_hi, log_r, log_c, int(sd.size))

    slope = float(np.polyfit(log_r, log_c, 1)[0])
    return CorrDimResult(slope, r_lo, r_hi, log_r, log_c, int(sd.size))


def correlation_dimension_embedded(
    series: np.ndarray, dim: int = EMBEDDING_DIM, tau: int | None = None, **kwargs
) -> CorrDimResult:
    """Correlation dimension of a scalar observable via delay embedding."""
    embedded = time_delay_embedding(series, dim=dim, tau=tau)
    return correlation_dimension(embedded, **kwargs)
