# Knowledge Ledger — Frankl's Union-Closed Sets Conjecture

Distinct PROVEN / DEAD / OPEN entries from the workshop runs, deduplicated. Each run carried this forward and added to it. Only entries with substantive content are listed here; the raw ledgers contained verify-step duplicates and partial-sentence echoes that have been removed.

## PROVEN

### Core fiber decomposition (k ≤ 4)

- **[P1] Fiber decomposition is sound.** For minimal $M \in \mathcal{F}$ with $|M| = k$, define $L_T = \{S \subseteq M : T \cup S \in \mathcal{F}\}$. Then $\mathcal{F}$ partitions as $\bigsqcup_T \{T \cup S : S \in L_T\}$, each $L_T$ is union-closed on $M$, and $M \in L_T$. The root fiber $L_\emptyset = \{M\}$ when $\emptyset \notin \mathcal{F}$.

- **[P2] Per-fiber LP value.** $\alpha_k = \min_{0 \le m \le k-1} (m \cdot 2^{m-1} + k)/(2^m + 1)$, achieved by $L_{m,k} = 2^{[m]} \cup \{[k]\}$. Specifically $\alpha_1 = 1/2$, $\alpha_2 = 1$, $\alpha_3 = 4/3$, $\alpha_4 = 8/5$, $\alpha_5 = 9/5$.

- **[P3] Verified $\alpha_4 = 8/5$ via parametric LP.** The inequality $3s + 8e \le 12 + 2p + 7t$ holds across all $(e, s) \in \{0,1\} \times \{0,\ldots,4\}$ under union-closure forcing $p \ge \binom{s}{2}$, $t \ge \binom{s}{3}$. Unique extremal $L = \{\emptyset, \{a\}, \{b\}, \{a,b\}, M\}$.

- **[P4] $k \le 4$ bound.** Any union-closed family containing a minimal nonempty member of size at most 4 has $\max_x p_x \ge 2/5$.

- **[P5] Reduction lemma.** Any counterexample to $\max p_x \ge 2/5$ has all minimal sets of size $\ge 5$. Equivalently, the $k = 5$ residual is the only thing standing between this technique and 2/5.

### k = 5 structure

- **[P6] Single-fiber LP for $k = 5$.** Sharp extremal bad fiber is $L = 2^e \cup \{M\}$ for some 2-edge $e \subseteq M$, with average $9/5$. Single-fiber bound is $9/25 = 0.36$, weaker than the entropy bound.

- **[P7] Cross-fiber forcing.** For any two bad fibers with labels $e, f$, $L_{T \cup U} \supseteq 2^{e \cup f} \cup \{M\}$. Average lower bounds: $|e \cup f| = 3 \Rightarrow$ avg $\ge 17/9$; $|e \cup f| = 4 \Rightarrow$ avg $\ge 37/17$.

- **[P8] Bad-fiber frequency formula.** $p_x^{\text{bad}} = B/5 + (2/5) d_x$ where $B = \sum_e b_e$, $d_x = \sum_{e \ni x} b_e$. $S_5$-equivariant.

- **[P9] One-chamber vertex profile (sharp).** For a fiber that is $A_z$-good for exactly one $z$: $p_z \ge 1/17$ and every other vertex $\ge 9/17$. Both bounds sharp. Fiber that is $A_z$-good for two distinct $z$ equals the full cube $2^M$ with all vertex frequencies exactly $1/2$.

- **[P10] A/B decomposition.** For a fiber $L$ with $\{x\} \in L$, set $A = \{S \subseteq Y : S \in L\}$, $B = \{S \subseteq Y : S \cup \{x\} \in L\}$ where $Y = M \setminus \{x\}$. Then $A \subseteq B$, both union-closed, and $p_x(L) = |B|/(|A| + |B|) \ge 1/2$.

- **[P11] $r$-fold overlap densities (verified).** If a fiber is $A_z$-good for $r$ different $z$, avg $|S| \ge a_r$ where $a_1 = 37/17$, $a_2 = 57/25$, $a_3 = 69/29$, $a_4 = 76/31$, $a_5 = 5/2$.

### k = 5 closures (partial)

- **[P12] High-$B$ closure.** $B \ge 75/119 \approx 0.630$ implies $\max p_x \ge 0.39$. Proven via global sum bound $\Sigma_x p_x \ge 9/5 + (119/500) B$.

- **[P13] Star case closure.** When all bad labels share a fixed vertex $x$, improved star estimate gives $p_x \ge (3/5)B + (1/17)(1-B) + (8/17) b_2$, which closes the case for $B \ge 563/920 \approx 0.612$.

- **[P14] $K_4$-slice closure.** If induced $K_4$ has bad mass $W_A \ge 969/1972$, $\max p_x \ge 0.39$.

- **[P15] $P_3$ branch.** $p_2, p_3 \ge 1/2$ in 123-good fibers (up-set block argument).

- **[P16] Triangle + opposite edge.** Closed with margin: $\max p_x \ge 0.437$ at $B = 75/119$.

- **[P17] Disjoint pair threshold.** If disjoint bad labels $e, f$ have $B_e + B_f \ge 1/4$, $\max p_x \ge 0.39$.

### k = 5 no-go theorem

- **[P18] Chamber-marginal LP exact value.** Every linear proof using only $(b_e, g_v)$ and the verified one-chamber profile $(1/17, 9/17)$ has exact value $t^*(B) = (185 - 32B)/425$. Boundary at $B = 77/128 = 0.6015625$. At $B = 75/119$: $t^*(75/119) = 3923/10115 \approx 0.38784 < 0.39$. Dead on $(77/128, 75/119]$. Tight at the isotropic profile $b_e = B/10$, $g_v = (1-B)/5$.

- **[P19] Equivariant linear transfers collapse.** Every $S_5$-equivariant linear map $T: E \to V$ has the form $(Tb)_x = \alpha\, d_x + \beta\, B$, because $\dim \operatorname{Hom}_{S_5}(E, V) = 2$. So no symmetric linear localization scheme can rescue the LP.

## DEAD

- **[D1] Entropy fiber-defect.** Saturates at 0.382. Same barrier as the universal entropy method.
- **[D2] Variance concentration.** Covariances $\Theta(n^2)$.
- **[D3] Union bound on minimal 3-sets.** Vacuous at $t \ge 6$.
- **[D4] Unaugmented recursion $\mathcal{F}^{-x}$.** Gives only $1/4$.
- **[D5] Single-fiber LP at $k = 5$.** Gives only $9/25 = 0.36$.
- **[D6] Subfamily frequency transfer to ambient family.** No clean transfer rule.
- **[D7] $N^2$ distinct mixed unions from $N$ fibers.** Collapses to $O(N)$ in chains.
- **[D8] Denominator-drop trick.** Computing favorable ratio on subsystem ignoring outside mass.
- **[D9] $q_z$-only coarse LP.** Symmetric optimum at $B=75/119$ is $2777/8092 < 0.39$.
- **[D10] Star + uniform 1/32 good-floor.** Yields only $0.3897 < 0.39$ at threshold (the right floor is $1/17$).
- **[D11] Treating $r$-fold overlap as pure loss.** Overlap is bonus density, not waste.
- **[D12] Triangle-plus-edge with refined slice bounds + per-fiber floors.** Sharp optimum $0.389711 < 0.39$ — failed before the $123$-good forcing was added.

## OPEN

- **[O1] Fiber-level coupling beyond chamber marginals.** Find a valid inequality $\lambda_x \ge \Phi_x(b)$ where $\Phi_x$ is not determined solely by $(d_x)$ and $(g_v)$. Must cut off the isotropic extremizer.

- **[O2] Multi-slice overlap theorem.** Prove that near-isotropic bad mass forces a positive amount of genuinely multi-slice good fibers, with explicit constant $\ge 437/202300$ at the vertex-frequency level.

- **[O3] Triangle-stable support obstruction.** Any new certificate must be positive on the triangle atom $b_{12} = b_{13} = b_{23} = B/3$, since disjoint-pair-only bonuses vanish there. Quantitatively, at $B = 75/119$ it must recover $\ge 14997/202300 \approx 0.0741374$ for one of vertices 1, 2, 3.

- **[O4] Nonlinear transport from compatibility data.** A fiber-incidence expansion theorem, a quadratic transport inequality, or an SDP-type certificate detecting structure invisible to symmetric linear maps.
