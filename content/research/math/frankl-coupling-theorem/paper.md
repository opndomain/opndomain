# A Quadratic Forcing Observable for Frankl's k = 5 Residual

**David Beardsley**
opndomain.com | April 29, 2026

*Continuation of [A Non-Entropic 2/5 Bound for Union-Closed Families with a Minimal 4-Set, and a No-Go Theorem for Chamber-Marginal LPs on the k = 5 Residual](/research/math/frankl-union-closed). The harness was rerun on a follow-up scenario that inherited the prior ledger verbatim — including the no-go theorem — and was instructed to find nonlinear signal in the regime where every linear observable is blind.*

---

## Abstract

The previous topic established that on the residual $k = 5$ regime ($B \in (77/128, 75/119]$ with all minimal sets of size $\geq 5$), every $S_5$-equivariant linear transfer from edge masses $\{b_e\}_{e \in E(K_5)}$ to vertex loads $\{\lambda_x\}_{x \in [5]}$ collapses to "degree plus total mass" because $\dim \operatorname{Hom}_{S_5}(E, V) = 2$. The isotropic point $b_e = B/10$ is the exact LP adversary, and every linear observable vanishes on it.

We prove three theorems that move the attack into the quadratic regime:

**Theorem A (first-stage transport inequality).** For each vertex $x$, the localized good-fiber load satisfies
$$\lambda_x \geq \frac{1}{|\mathcal{F}|} \sum_{W \in I_x} s_x(W),$$
where $I_x$ is the image of a dependent coupling $u_x : \Omega_x \to 2^{[n]}$ pairing bad fibers with complementary $x$-disjoint labels. The mass of $\Omega_x$ is exactly $|\mathcal{F}|^2 \Psi_x / 25$, where $\Psi_x = \sum_{\{e,f\} \in \mathcal{P}_x} b_e b_f$ is the second-elementary-symmetric source term. At the LP adversary, $\Psi_x = 3(B/10)^2 > 0$.

**Theorem B (exact nonlinear mark on hit outputs).** For every $W \in I_x$, the augmentation-success mark
$$\Sigma_x(W) := \sum_{i \neq x} \rho_{x,W}(i) \alpha_i(W) \in \{1/16, 1\}$$
takes value $1/16$ on tagged hit outputs and $1$ on full ones. Consequently $s_x(W) = 16 + 16 \Sigma_x(W)$.

**Theorem C (equivalent defect form).** The augmentation defect $D_x(W) := |R_x(L_W)| - |M_x(L_W)|$ is $0$-or-$1$ valued and satisfies $s_x(W) = 32 - 15 D_x(W)$ and $D_x(W) = (16/15)(1 - \Sigma_x(W))$.

The remaining gap — closing $\max p_x \geq 0.39$ — is now exactly: bound the *average* of $\Sigma_x(W)$ over hit outputs, away from the worst-case full-tagged value $1/16$. The quadratic angle has positive signal where the linear LP was provably blind. We do not close the gap; we identify the exact remaining inequality, the obstructions to two natural lines of attack (projection-only transport, universal capacity), and the structural lemmas (star-or-triangle dichotomy, comparable-fiber intersection) that constrain it.

---

## 1. The setup, inherited

Let $\mathcal{F}$ be union-closed on $[n]$ with all minimal sets of size $\geq 5$, and fix a minimal $5$-set $M = [5]$. Use the fiber decomposition $\mathcal{F} = \bigsqcup_{T \in P} \{T \cup S : S \in L_T\}$ from the prior topic, with each $L_T$ union-closed on $M$ and $M \in L_T$.

By the three-type rigidity proved in the prior topic:
- A *bad* fiber has the extremal shape $L_T = 2^e \cup \{M\}$ for some edge $e \subseteq M$.
- A *good* fiber is either *untagged* (universal $1/17$ floor), *singly tagged* ($Q_i := 2^{M \setminus \{i\}} \cup \{M\}$, with $9/17$ on support and $1/17$ on $i$), or *full* ($L_T = 2^M$, with $1/2$ everywhere).

For each edge $e$, let $\mathcal{B}_e$ be the set of bad fibers labeled $e$, $n_e := |\mathcal{B}_e|$, and $b_e := 5 n_e / |\mathcal{F}|$. Then $B = \sum_e b_e \in (77/128, 75/119]$ throughout.

The prior topic's no-go theorem says every linear observable on $\{b_e\}$ collapses to $\alpha\, d_x + \beta\, B$. At the LP adversary $b_e = B/10$, $d_x = 2B/5$ for every $x$, so every linear observable is constant in $x$ and matches the adversary value $(185 - 32B)/425 < 0.39$.

---

## 2. The dependent coupling

Fix $x \in M$. The three complementary edge-pairs on $M \setminus \{x\}$ are
$$\mathcal{P}_x = \{\{e, f\} : e \cap f = \emptyset,\ e \cup f = M \setminus \{x\}\}.$$
There are exactly three such pairs (a perfect-matching count on $K_4$).

Define the first-stage certificate space
$$\Omega_x := \bigsqcup_{\{e, f\} \in \mathcal{P}_x} \mathcal{B}_e \times \mathcal{B}_f,$$
with the coupling map $u_x : \Omega_x \to 2^{[n]}$ given by $(T, U) \mapsto W := T \cup U$.

By cross-fiber forcing from the prior topic ($L_{T \cup U} \supseteq 2^{e \cup f} \cup \{M\}$), every hit output $W$ is *$x$-good*: it contains $2^{M \setminus \{x\}}$, hence by three-type rigidity is either tagged of type $Q_i$ for some $i \neq x$ or full ($2^M$).

For $W \in I_x := u_x(\Omega_x)$, let $c_x(W) := |u_x^{-1}(W)|$ be the certificate multiplicity, and for each color $i \neq x$ let $c_{x,i}(W)$ count first-stage certificates with label $\{e, f\}$ such that $\{i\} = M \setminus \{x\} \setminus (e \cup f \setminus \{i\})$ — i.e., the certificates whose union is the chamber complementary to $i$. The posterior color law is
$$\rho_{x, W}(i) := c_{x, i}(W) / c_x(W).$$

---

## 3. Theorem A — first-stage transport inequality

**Theorem A.** *For every $x \in M$,*
$$\lambda_x \geq \frac{|\Omega_x|}{|\mathcal{F}|}\, \mathbb{E}_{\omega \in \Omega_x}\!\left[\frac{s_x(u_x(\omega))}{c_x(u_x(\omega))}\right] = \frac{1}{|\mathcal{F}|} \sum_{W \in I_x} s_x(W).$$
*The total mass of $\Omega_x$ is*
$$|\Omega_x| = \frac{|\mathcal{F}|^2}{25}\, \Psi_x, \qquad \Psi_x := \sum_{\{e, f\} \in \mathcal{P}_x} b_e b_f.$$
*At the LP adversary $b_e = B/10$, $\Psi_x = 3(B/10)^2 > 0$.*

**Proof sketch.** The summation identity follows from telescoping the certificate multiplicity. Since each $W \in I_x$ contains $2^{M \setminus \{x\}}$, its $x$-load $s_x(W)$ is at least $17$ (tagged case) and at most $32$ (full case), and the sum is contained in the total $x$-localized good load $\lambda_x \cdot |\mathcal{F}|$. The mass calculation uses $b_e = 5 n_e / |\mathcal{F}|$:
$$|\Omega_x| = \sum_{\{e,f\} \in \mathcal{P}_x} n_e n_f = \frac{|\mathcal{F}|^2}{25} \sum_{\{e,f\}} b_e b_f.$$
At isotropy, all three summands equal $(B/10)^2$, giving $\Psi_x = 3(B/10)^2$. $\square$

**The point.** $\Psi_x$ is a quadratic observable on the bad-edge masses. Every $S_5$-equivariant *linear* observable vanishes on the isotropic adversary. $\Psi_x$ does not. The no-go theorem from the prior topic does not apply.

In the cross-domain pass, the same observable was rederived in a different form: writing $a_i := b_{xi}$ for the four edges incident to $x$,
$$Q_x := \sum_{1 \leq i < j \leq 4} a_i a_j = \tfrac{1}{2}\bigl((\textstyle\sum a_i)^2 - \sum a_i^2\bigr)$$
is the second elementary symmetric polynomial on the local $x$-channel profile. $Q_x$ and $\Psi_x$ are the same nonlinear forcing object, expressed once as a sum over complementary pairs and once as a Sym$^2$-invariant on the local star.

---

## 4. Theorem B — the augmentation-success mark

For each color $i \neq x$ and each fiber $L$ on $M$, define
$$\alpha_i(L) := \frac{1}{16}\, \bigl|\{A \subseteq M \setminus \{i\} : A \cup \{i\} \in L\}\bigr|.$$
This is the success probability of a uniformly random $i$-augmentation inside $L$.

**Theorem B.** *For every $W \in I_x$,*
$$\Sigma_x(W) := \sum_{i \neq x} \rho_{x, W}(i)\, \alpha_i(L_W) \in \{1/16,\, 1\}.$$
*Specifically, $\Sigma_x(W) = 1/16$ when $L_W = Q_i$ for some $i \neq x$ (tagged) and $\Sigma_x(W) = 1$ when $L_W = 2^M$ (full). Consequently,*
$$s_x(W) = 16 + 16\, \Sigma_x(W).$$

**Proof sketch.** By three-type rigidity $L_W$ is one of $\{Q_2, Q_3, Q_4, Q_5\}$ or $2^M$. If $L_W = Q_i$, every certificate hitting $W$ has color $i$ (the edge pair $\{e, f\}$ with $e \cup f = M \setminus \{x, i\}$), so $\rho_{x, W} = \delta_i$. Inside $Q_i$, exactly one of the $16$ $i$-augmentations succeeds (the one giving $M$ itself), so $\alpha_i(Q_i) = 1/16$. Hence $\Sigma_x(W) = 1/16$. If $L_W = 2^M$, every augmentation succeeds, so $\Sigma_x(W) = 1$. The formula $s_x(W) = 16 + 16 \Sigma_x(W)$ then matches the $\{17, 32\}$ image. $\square$

---

## 5. Theorem C — equivalent defect form

**Theorem C.** *Write $D_x(W) := |R_x(L_W)| - |M_x(L_W)|$ for the augmentation defect. Then*
$$D_x(W) \in \{0, 1\}, \qquad s_x(W) = 32 - 15 D_x(W), \qquad D_x(W) = \tfrac{16}{15}\bigl(1 - \Sigma_x(W)\bigr).$$

**Implication.** Theorem A combined with Theorems B, C gives
$$\lambda_x \geq \frac{1}{|\mathcal{F}|} \sum_{W \in I_x} \bigl(16 + 16\, \Sigma_x(W)\bigr) = \frac{16 |I_x|}{|\mathcal{F}|}\, \bigl(1 + \overline{\Sigma}_x\bigr),$$
where $\overline{\Sigma}_x$ is the *unweighted* average of $\Sigma_x$ over the hit set $I_x$. **The remaining gap is a single inequality**: bound $\overline{\Sigma}_x$ away from $1/16$. Equivalently, bound the average defect $\overline{D}_x$ away from $1$.

---

## 6. What does NOT work

Three substantive approaches were attempted and killed in verify.

**Projection-only transport.** Any transport inequality whose right-hand side depends only on the projection-level output law of $u_x$ — i.e., the multiset $\{\rho_{x, W}\}_{W \in I_x}$ — must give the same value on two configurations with the same law but different defect. We constructed two tensor-blow-up families with identical projection law and different $\overline{D}_x$, proving the bound has to use joint structure of $(W, \Sigma_x(W))$, not $W$'s law alone.

**Universal capacity bound.** The candidate inequality $N_x(W) \leq C |L_W|$ (number of first-stage certificates landing at $W$ bounded linearly in fiber size) is killed by tensor blow-up: exponentially many certificates collapse onto one fiber while $|L_W|$ stays constant. So linear capacity arguments cannot recover $\overline{D}_x$ from $\overline{\Sigma}_x$ alone.

**Potts-type color-mixing.** A natural attempt at a nonlinear invariant — colored partition energies in the style of Potts-model statistics — turns out to be strictly weaker than $\Sigma_x(W)$. It does not detect the all-monochromatic full case, which is where the gap lives.

These are not LP refinements. They are real structural limits: any closure inequality must be marked-transport-shaped, must use joint $(W, \Sigma_x(W))$ data, and must distinguish monochromatic full from tagged hits.

---

## 7. Auxiliary structure

Two unconditional, nonlinear lemmas constrain the geometry $\overline{\Sigma}_x$ has to live in.

**Comparable-fiber intersection lemma (unconditional).** For any two bad fibers $T \subseteq U$, their labels intersect: $e(T) \cap e(U) \neq \emptyset$.

**Star-or-triangle dichotomy.** Bad labels on any totally ordered chain of projections are pairwise intersecting 2-element subsets of $[5]$. By the EKR classification, they form either a *star* (sharing a common vertex) or a *triangle* (all three edges of a triangle in $K_5$). These are the only EKR extremizers.

The star case directly localizes good load on the shared vertex; this is the regime closed in the prior topic via the improved star estimate. The triangle case is the residual obstruction. Any closure of $\overline{\Sigma}_x$ has to be active in the triangle regime.

---

## 8. Open

The complete remaining program:

- **[O1] Source-to-mark transport.** Prove a quantitative inequality of the form $\sum_{W \in I_x} \Sigma_x(W) \geq \Phi_x^{\text{src}}$, with $\Phi_x^{\text{src}}$ a source-visible nonlinear functional that is strictly positive at the isotropic point.
- **[O2] Average defect bound.** Equivalently, prove $\overline{D}_x \leq 1 - \varepsilon$ for some $\varepsilon$ forced by source geometry.
- **[O3] Monochromatic full-output detector.** Find a source-visible invariant detecting $L_W = 2^M$ where $\rho_{x, W} = \delta_i$ — i.e., the monochromatic-full case where every hit certificate has the same color.
- **[O4] Marked-transport inequality.** Use $(W, \Sigma_x(W))$ joint data, not $W$'s law alone (per the failure of projection-only transport).

Each open item is precisely stated. None is tractable from inside the linear LP class — the no-go from the prior topic remains in force. All four are quadratic-or-higher observables in the bad-edge masses.

---

## 9. Methodology and provenance

This topic was produced by the master orchestrator (`run-research-master.mjs`) running three cognitive variants — base, alien-constraint, cross-domain — on the scenario `frankl-coupling-theorem.json` with the prior topic's verified ledger inherited verbatim (including the no-go theorem as `[DEAD-2]`). All three runs used Codex GPT-5.4 across three personas (Coupling Builder, Defect Analyst, Structure Miner). Total compute: ~2 hours.

The inheritance mechanism is the key methodological point: the harness's persistent knowledge base meant the second topic *started* with the first topic's open questions and dead approaches loaded as constraints. The cross-domain pass — instructed to attack with foreign techniques (Sym$^2$ invariants, EKR classification, representation-theoretic obstructions) — produced the quadratic observable formulation in the language of the local star.

Three killed approaches in this topic (projection-only transport, universal capacity, Potts color-mixing) were caught by the verify step before reaching synthesis. They are surfaced on the [Killed claims](#) page rather than buried, because they are real structural limits future work must respect.

---

## References

Same as the prior topic ([source paper](/research/math/frankl-union-closed)), plus this work builds directly on:

- **The no-go theorem (prior topic, §4)** — established that linear methods are exhausted.
- **The three-type rigidity (prior topic, §3)** — used to classify hit outputs as $Q_i$ or $2^M$.
- **Cross-fiber forcing (prior topic, §3)** — used to prove every hit output is $x$-good.

---

*Workshop transcripts, knowledge ledger, and the open-source research harness are available at [opndomain.com](https://opndomain.com).*
