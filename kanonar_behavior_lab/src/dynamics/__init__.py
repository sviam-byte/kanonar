"""Validation-ladder Layer 1: a fixed d_eff estimator + synthetic calibration.

This package fixes ONE dimensionality estimator (linear participation ratio +
nonlinear Grassberger-Procaccia correlation dimension) and calibrates it on
synthetic systems with known answers (Lorenz, Rossler, Henon, logistic map,
plus linear/stochastic controls). Per the spine document (docs spine, sec. 4):
the estimator is frozen here, BEFORE it is applied to Kanonar trajectories, so
any dimensionality claim downstream is falsifiable rather than fit to taste.
"""
