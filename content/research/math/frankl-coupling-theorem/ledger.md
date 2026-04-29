# Knowledge Ledger — Coupling Theorem for Frankl k = 5

Distinct PROVEN / DEAD / OPEN entries from the three master-orchestrator runs (base, alien-constraint, cross-domain) on this scenario, deduplicated. The prior topic's ledger was inherited verbatim and is not duplicated here.

## PROVEN

- **[P1] First-stage transport inequality.**
$$\lambda_x \geq \frac{|\Omega_x|}{|\mathcal{F}|}\, \mathbb{E}_{\omega \in \Omega_x}\!\left[\frac{s_x(u_x(\omega))}{c_x(u_x(\omega))}\right] = \frac{1}{|\mathcal{F}|} \sum_{W \in I_x} s_x(W).$$

- **[P2] Source factor.** $\Psi_x = \sum_{\{e,f\} \in \mathcal{P}_x} b_e b_f$, with $|\Omega_x| = |\mathcal{F}|^2 \Psi_x / 25$. At the LP adversary $b_e = B/10$: $\Psi_x = 3(B/10)^2 > 0$.

- **[P3] Quadratic-observable equivalent.** Writing $a_i = b_{xi}$ for the four edges incident to $x$,
$$Q_x = \sum_{1 \leq i < j \leq 4} a_i a_j = \tfrac{1}{2}\bigl((\textstyle\sum a_i)^2 - \sum a_i^2\bigr)$$
is the second elementary symmetric polynomial on the local $x$-channel profile. $Q_x$ and $\Psi_x$ are the same forcing object in different bases. $Q_x = 6(B/10)^2$ at isotropy.

- **[P4] Augmentation-success mark.** For every hit output $W$,
$$\Sigma_x(W) := \sum_{i \neq x} \rho_{x, W}(i)\, \alpha_i(L_W) \in \{1/16, 1\},$$
$1/16$ iff $L_W = Q_i$ (tagged), $1$ iff $L_W = 2^M$ (full).

- **[P5] Exact load formula.** $s_x(W) = 16 + 16 \Sigma_x(W) = 32 - 15 D_x(W)$.

- **[P6] Defect zero-one.** $D_x(W) := |R_x(L_W)| - |M_x(L_W)| \in \{0, 1\}$, with $D_x = 1 \iff$ tagged and $D_x = 0 \iff$ full.

- **[P7] Comparable-fiber intersection lemma (unconditional, nonlinear).** For any two bad fibers $T \subseteq U$, their labels intersect.

- **[P8] Star-or-triangle dichotomy.** Bad labels on any comparable chain are pairwise intersecting 2-edges. By EKR classification on $\binom{[5]}{2}$, they form either a star (common vertex) or a triangle. These are the only extremizers.

## DEAD

- **[D1] Transport from projection law alone.** Two tensor-blow-up families with identical projection law $\{\rho_{x, W}\}_{W \in I_x}$ have different average defect $\overline{D}_x$. Any closure must use joint $(W, \Sigma_x(W))$ data.

- **[D2] Universal capacity bound.** $N_x(W) \leq C |L_W|$ killed by tensor blow-up: exponentially many certificates collapse onto one fiber while $|L_W|$ stays constant.

- **[D3] Potts-type color-mixing.** Colored partition-energy invariants in the style of Potts statistics are strictly weaker than $\Sigma_x(W)$. They miss the monochromatic full-output case.

- **[D4] Any linear observable on edge masses.** Inherited from the prior topic's no-go theorem; reaffirmed here against the isotropic point.

## OPEN

- **[O1] Source-to-mark transport.** Prove $\sum_{W \in I_x} \Sigma_x(W) \geq \Phi_x^{\text{src}}$ for a source-visible nonlinear functional positive at $b_e = B/10$.

- **[O2] Average defect bound.** Equivalently, $\overline{D}_x \leq 1 - \varepsilon$ for some $\varepsilon > 0$ forced by source geometry.

- **[O3] Monochromatic full detector.** Source-visible invariant detecting $L_W = 2^M$ with $\rho_{x, W} = \delta_i$ for some single $i$.

- **[O4] Marked-transport inequality.** Use joint $(W, \Sigma_x(W))$, not $W$'s law alone.

- **[O5] Entropy/SDP certificate.** A single observable whose output exactly lower-bounds $\overline{\Sigma}_x$ and survives tensor blow-up.

- **[O6] Triangle-regime quantification.** The triangle case is the binding obstruction. Any closure has to be active there. (Star case is closed in the prior topic.)
