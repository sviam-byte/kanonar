"""Static-basis sign-audit (Phase 3 triage).

Consumes the long-format basis_sweep.csv exported by the TS probe harness
(lib/goal-lab/probe) and classifies each pre-registered prediction:
PASS / DEAD / MISLABELED / NON_MONOTONE / READOUT_ABSENT, with cliff (BUG?) and
scene-leak flags. See docs/GOAL_LAB_PROBE_HARNESS.md.
"""
