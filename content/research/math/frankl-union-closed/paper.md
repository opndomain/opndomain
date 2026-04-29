# A Non-Entropic 2/5 Bound for Union-Closed Families with a Minimal 4-Set, and a No-Go Theorem for Chamber-Marginal LPs on the k = 5 Residual

**David Beardsley**
opndomain.com | April 29, 2026

---

## Abstract

We give a non-entropic proof that every finite union-closed family $\mathcal{F}$ containing a minimal nonempty member of size at most 4 satisfies $\max_x p_x \geq 2/5$, where $p_x = |\{A \in \mathcal{F} : x \in A\}|/|\mathcal{F}|$. The argument is a fiber decomposition over a fixed minimal member combined with a sharp linear program on union-closed families over a small ground set ($\alpha_k = \min_m (m \cdot 2^{m-1} + k)/(2^m + 1)$, achieved by $L = 2^{[m]} \cup \{M\}$).

On this restricted class — families whose minimum minimal-set size is $\leq 4$ — the bound $2/5 = 0.400$ strictly exceeds the universal entropy bound of $(3 - \sqrt{5})/2 \approx 0.382$ (Gilmer 2022, refined by Chase–Lovett, Alweiss–Huang–Sellke, Sawin). On the complementary class (all minimal sets of size $\geq 5$) our technique gives only $\alpha_5/5 = 9/25 = 0.360$, so it does not improve the universal bound.

We additionally prove a no-go theorem for the residual $k = 5$ regime: every linear proof using only edge-mass bad statistics, chamber marginals, and the verified one-chamber profile $(1/17, 9/17)$ has exact value $(185 - 32B)/425$, which is below $0.39$ on the entire interval $B \in (77/128,\, 75/119]$. Equivalently, every $S_5$-equivariant linear transfer from edge mass to vertex load collapses to "degree plus total mass" because $\dim \operatorname{Hom}_{S_5}(E, V) = 2$. Closing the residual gap therefore requires a coupling theorem — a structural input outside the LP class — not a tighter LP refinement.

The work was produced by a custom multi-model AI research harness over roughly eight hours of compute. The framework was developed in an initial run with three models (Codex GPT-5.4, Claude Opus 4.6, Grok 4.1); the technical derivation of the $2/5$ bound and the subsequent no-go theorem were synthesized predominantly by Codex playing all three personas in later runs.

---

## 1. Background

Frankl's Union-Closed Sets Conjecture (1979) states that for any finite family $\mathcal{F}$ of finite sets closed under union, with $\mathcal{F} \neq \{\emptyset\}$, some element belongs to at least half the sets. Despite four decades of work the conjecture remains open.

The strongest universal lower bound comes from the entropy method initiated by Gilmer (2022) and refined by Chase–Lovett, Alweiss–Huang–Sellke, and Sawin (2022–2023), establishing $\max_x p_x \geq (3 - \sqrt{5})/2 \approx 0.382$. This bound is provably tight for the entropy framework: the independent coupling saturates at this value on the Boolean cube.

For families with small minimal sets, partial results have been known since the 1980s. Sarvate–Renaud and Poonen (1992) handled small minimal cases via direct combinatorial arguments. To our knowledge, the sharp non-entropic value $2/5$ for the class of families containing a minimal 4-set has not previously appeared in this explicit form, although the underlying single-fiber LP has likely been considered in folklore form.

**Our contribution.** Two precise, verifiable results:

1. **A sharp $2/5$ bound for $k \leq 4$** (Theorem 1, §2–3). Non-entropic, structural, finite case-check.
2. **A no-go theorem for $k = 5$** (Theorem 2, §4). Identifies an entire class of linear proofs that cannot reach $0.39$, with an exact LP optimum and a clean representation-theoretic obstruction.

Neither result proves Frankl. Both are precisely scoped.

**Convention.** Throughout, $\mathcal{F}$ is union-closed and $\mathcal{F} \neq \{\emptyset\}$. We allow $\emptyset \in \mathcal{F}$. Adding or removing $\emptyset$ does not affect the validity of any of our bounds.

---

## 2. Main Result

**Theorem 1.** *Let $\mathcal{F}$ be a finite union-closed family with $\mathcal{F} \neq \{\emptyset\}$. If $\mathcal{F}$ contains a minimal nonempty member of size at most $4$, then*
$$\max_{x} \frac{|\{A \in \mathcal{F} : x \in A\}|}{|\mathcal{F}|} \geq \frac{2}{5} = 0.400.$$

**Proof overview.** Fix a minimal nonempty $M \in \mathcal{F}$ with $|M| = k \leq 4$. For each $T$ in the projection family $P = \{A \setminus M : A \in \mathcal{F}\}$, define the fiber $L_T = \{S \subseteq M : T \cup S \in \mathcal{F}\}$. Then:

1. $\mathcal{F}$ partitions as $\bigsqcup_{T \in P} \{T \cup S : S \in L_T\}$.
2. Each $L_T$ is union-closed on $M$ with $M \in L_T$.
3. The minimum average set size over union-closed $L \subseteq 2^M$ with $M \in L$ equals $\alpha_k$, the LP value defined in §3.
4. Fiber averaging: $\sum_{x \in M} p_x = \frac{1}{|\mathcal{F}|} \sum_T \sum_{S \in L_T} |S| \geq \alpha_k$.
5. For $k \leq 4$: $\alpha_k / k \geq 2/5$.

The minimum is realized at $k = 4$, where $\alpha_4 = 8/5$ and $\alpha_4 / 4 = 2/5$. ∎

**Remark on tightness.** The LP value $\alpha_4 = 8/5$ is sharp on the per-fiber level (achieved by $L = \{\emptyset, \{a\}, \{b\}, \{a,b\}, M\}$). However, the empty fiber $L_\emptyset = \{M\}$ alone contributes average $|M| = 4$, so for any actual finite $\mathcal{F}$ the strict inequality $\max p_x > 2/5$ holds, with the gap shrinking as $|\mathcal{F}| \to \infty$. We do not claim $2/5$ is achieved by any finite family.

---

## 3. The Fiber Decomposition Technique

### 3.1 Setup

Let $\mathcal{F}$ be union-closed on ground set $[n]$ with minimal nonempty members $\mathcal{M}$. Fix $M \in \mathcal{M}$. For $T \subseteq [n] \setminus M$ define $L_T = \{S \subseteq M : T \cup S \in \mathcal{F}\}$.

### 3.2 Fiber structure

$L_T$ is union-closed on $M$: if $S_1, S_2 \in L_T$ then $T \cup S_1, T \cup S_2 \in \mathcal{F}$, so by union-closure $T \cup (S_1 \cup S_2) \in \mathcal{F}$, hence $S_1 \cup S_2 \in L_T$.

$M \in L_T$: pick any $A \in \mathcal{F}$ with $T = A \setminus M$. Then $A, M \in \mathcal{F}$, so $A \cup M = T \cup M \in \mathcal{F}$, hence $M \in L_T$.

Whether $\emptyset \in L_T$ depends on whether $T \in \mathcal{F}$.

### 3.3 Per-fiber LP

For $|M| = k$, define
$$\alpha_k = \min_{L} \frac{1}{|L|} \sum_{S \in L} |S|,$$
where the minimum is over union-closed $L \subseteq 2^M$ with $M \in L$ (and $\emptyset$ permitted, since fibers can contain $\emptyset$).

The extremal families are $L_{m,k} = 2^{[m]} \cup \{[k]\}$ for $0 \leq m \leq k - 1$, giving
$$\alpha_k = \min_{0 \leq m \leq k - 1} \frac{m \cdot 2^{m-1} + k}{2^m + 1}$$
with the convention $0 \cdot 2^{-1} = 0$ at $m = 0$ (so $m = 0$ corresponds to $L = \{\emptyset, M\}$ with average $k/2$).

### 3.4 Frequency bound

Since $\sum_{x \in M} p_x = \frac{1}{|\mathcal{F}|} \sum_T \sum_{S \in L_T} |S| \geq \alpha_k$, we get $\max_{x \in M} p_x \geq \alpha_k / k$.

| $k$ | optimal $m$ | $\alpha_k$ | $\alpha_k / k$ | vs. entropy 0.382 |
|:---:|:-----------:|:---------:|:--------------:|:-----------------:|
| 1   | 0           | 1/2       | 1/2 = 0.500    | exceeds           |
| 2   | 0 or 1 (tie)| 1         | 1/2 = 0.500    | exceeds           |
| 3   | 1           | 4/3       | 4/9 ≈ 0.444    | exceeds           |
| 4   | 2           | 8/5       | 2/5 = 0.400    | **exceeds**       |
| 5   | 2           | 9/5       | 9/25 = 0.360   | below             |

For $k \leq 4$, the fiber decomposition strictly exceeds the universal entropy bound on the restricted class. For $k \geq 5$ it is weaker than entropy, and the entropy bound subsumes it.

### 3.5 Verification of $\alpha_4 = 8/5$

Parametrize $L \subseteq 2^M$ ($|M| = 4$) by $e = \mathbb{1}[\emptyset \in L]$, $s = $ number of singletons in $L$, $p = $ number of $2$-subsets in $L$, $t = $ number of $3$-subsets in $L$, with $M \in L$ always. Then $|L| = 1 + e + s + p + t$, $\sum |S| = 4 + s + 2p + 3t$, and the inequality $\sum |S| / |L| \geq 8/5$ is equivalent to
$$3s + 8e \leq 12 + 2p + 7t. \qquad (*)$$
Union-closure forces $p \geq \binom{s}{2}$ and $t \geq \binom{s}{3}$, and $(*)$ is then a finite case-check over $(e, s) \in \{0, 1\} \times \{0, 1, 2, 3, 4\}$. The unique equality case is $(e, s, p, t) = (1, 2, 1, 0)$, i.e. $L = \{\emptyset, \{a\}, \{b\}, \{a, b\}, M\}$. The same parametric LP method extends to general $k$, confirming the formula in §3.3. ∎

---

## 4. The k = 5 Residual: A No-Go Theorem

When every minimal set has size $\geq 5$, the fiber LP gives only $9/25 = 0.36$, which is below the entropy bound. We do not improve the universal bound on this class. We do, however, prove that an entire class of natural strengthenings cannot reach $0.39$.

### 4.1 Setup

Fix a minimal $5$-set $M = [5]$. The single-fiber LP is sharp: bad fibers (those of $9/5$-extremal type) are $L = 2^e \cup \{M\}$ for some edge $e \subseteq M$ of size $2$. Let $b_e \geq 0$ be the bad-fiber mass on edge $e$, $B = \sum_e b_e$, and $d_x = \sum_{e \ni x} b_e$. Each vertex $x$ has bad-fiber contribution $p_x^{\text{bad}} = B/5 + (2/5) d_x$ (verified, $S_5$-equivariant).

Good fibers (mass $1 - B$) decompose by chamber: for each $v \in M$, let $g_v$ be the mass of fibers supported on the $4$-vertex chamber $U_v = M \setminus \{v\}$, so $\sum_v g_v = 1 - B$. The verified one-chamber vertex profile is
$$q_x^{(v)} = \begin{cases} 9/17 & x \neq v \\ 1/17 & x = v \end{cases}$$
(both bounds sharp, verified across multiple workshop iterations).

Every linear proof using only $(b_e, g_v)$ and these profiles certifies
$$p_x \geq \frac{B}{5} + \frac{2}{5} d_x + \sum_{v} g_v q_x^{(v)}.$$

### 4.2 Theorem 2 (No-Go)

**Theorem 2.** *Let $t^*(B)$ be the minimum of $\max_x [B/5 + (2/5) d_x + \sum_v g_v q_x^{(v)}]$ over all feasible $(b, g)$. Then*
$$t^*(B) = \frac{185 - 32B}{425}.$$
*This LP class certifies $\max_x p_x \geq 0.39$ only for $B \leq 77/128 = 0.6015625$. At the residual boundary $B = 75/119$, it gives $3923/10115 \approx 0.38784 < 0.39$. The entire interval $(77/128,\, 75/119]$ is dead for this class.*

**Proof sketch.** Lemma 1: from the chamber profile, $\sum_v g_v q_x^{(v)} = (1 - B)/17 + (8/17) \sum_{v \neq x} g_v$. Lemma 2: averaging over $x$ uses $\sum_x d_x = 2B$ and $\sum_x \sum_{v \neq x} g_v = 4(1 - B)$, giving
$$\max_x p_x \geq \frac{1}{5} \sum_x p_x \geq \frac{9B}{25} + \frac{37(1 - B)}{85} = \frac{185 - 32B}{425}.$$
Lemma 3: equality is attained at the isotropic profile $b_e = B/10$, $g_v = (1 - B)/5$. ∎

### 4.3 Theorem 3 (Equivariant Linear Transfers Collapse)

**Theorem 3.** *Let $E = \mathbb{R}^{E(K_5)}$ and $V = \mathbb{R}^{[5]}$ with the natural $S_5$-actions. Then every $S_5$-equivariant linear map $T : E \to V$ has the form $(Tb)_x = \alpha\, d_x + \beta\, B$ for some $\alpha, \beta \in \mathbb{R}$.*

**Proof.** As $S_5$-modules, $V \cong \mathbf{1} \oplus \mathbf{4}$ and $E \cong \mathbf{1} \oplus \mathbf{4} \oplus \mathbf{5}$. Hence $\dim \operatorname{Hom}_{S_5}(E, V) = 2$, generated by $b \mapsto B \cdot \mathbf{1}$ and $b \mapsto d$. ∎

### 4.4 Implication

Together, Theorems 2 and 3 say: the residual gap $B \in (77/128,\, 75/119]$ cannot be closed by any symmetric linear localization scheme using only $(b_e, g_v)$ data. Closing the gap requires a *coupling theorem* — a new inequality forcing correlation between bad-label geometry and good-fiber support localization. Examples of where such an input might come from include fiber-incidence expansion, quadratic transport inequalities, or SDP-type certificates that detect structure invisible to symmetric linear maps.

This is partial progress, not a proof. The value of Theorem 2 is that it precisely identifies a class of approaches that *cannot* close the gap — telling other researchers which doors are locked.

---

## 5. Methodology: Multi-Model AI Research Workshop

All results were produced by a custom research harness orchestrating multiple LLMs in iterative explore/build/verify cycles with a persistent knowledge ledger.

### 5.1 Workshop structure

Each run follows a loop:
1. **EXPLORE**: each agent proposes an approach.
2. **BUILD**: agents extend the strongest thread sequentially, each seeing prior work.
3. **VERIFY**: agents audit all claims, tagging as PROVEN / DEAD / OPEN.
4. **Iterate**: if fatal flaws are found, loop back to BUILD with the critique incorporated.
5. **SYNTHESIZE**: a final pass produces a self-contained document.

### 5.2 Knowledge ledger

A persistent markdown file tracks PROVEN results, DEAD approaches (with explicit counterexample), and OPEN questions. Agents read the ledger instead of the full transcript.

### 5.3 Honest model attribution

The work spanned approximately eight hours over roughly ten workshop runs. Two phases:

- **Framework phase (run 1, 2026-04-28 14:37):** three distinct models — Codex GPT-5.4 (Constructor), Claude Opus 4.6 (Bridge Builder), Grok 4.1 Fast (Auditor). Established the entropy-vs-fiber framing.
- **Derivation phase (run 2 onward, 2026-04-28 19:06 → 2026-04-29 10:39):** the Theorem 1 proof of the $2/5$ bound originated in run 2, where a Codex-played "Calculator" persona derived $\alpha_4 = 8/5$ via the parametric LP and the partition argument. Run 2 was multi-model (Codex + Codex + Grok). Runs 3–10, which produced the Theorem 2 no-go work, were Codex playing all three personas. The final synthesis was Codex.

Honesty matters here. The branding of "three models collaborating" is accurate for the framework run; subsequent runs collapsed to a single high-reasoning model playing distinct personas under different prompts. The persona structure remained valuable — adversarial verification caught real errors (notably an attempted $k = 4 \Rightarrow 1/2$ proof that was demolished on Build pass 2 because $L_\emptyset = \{M\}$ alone forces a non-extremal fiber).

### 5.4 Verified content statistics (deduplicated)

The raw ledgers contain duplicate and partial-sentence entries. After deduplication, the distinct content across all runs is:

| Metric | Value |
|--------|-------|
| Distinct PROVEN lemmas (deduplicated) | ~18 |
| Distinct DEAD approaches with concrete counterexample | ~12 |
| OPEN questions, precisely stated | ~14 |
| Major false claims caught and killed by verify step | 3 |

The most important false claim caught was the Explorer's attempt to push the $k = 4$ bound from $2/5$ to $1/2$ via a "bad-fiber incompatibility" argument; the Proof Writer's pass-2 verification noted that $L_\emptyset = \{M\}$ alone breaks the equality analysis. This is the kind of correction that makes the persona-and-ledger structure load-bearing even when one model is playing all roles.

---

## 6. Conclusion

We have proved two precisely scoped results on Frankl's Union-Closed Sets Conjecture:

1. A non-entropic $2/5$ bound for families with a minimal set of size $\leq 4$, exceeding the universal entropy bound on this class. The bound is sharp at the LP level.
2. A no-go theorem for the residual $k = 5$ regime: no symmetric linear localization scheme using only edge-mass and chamber-marginal data can reach $0.39$ on the interval $B \in (77/128,\, 75/119]$.

Neither result resolves the conjecture. The fiber decomposition does not improve the universal bound — for $k \geq 5$ it is strictly weaker than entropy. The no-go theorem identifies a structural obstruction: the residual gap requires a coupling theorem, not an LP refinement.

The methodology — multi-model research workshops with persistent knowledge ledgers and adversarial verification — is honest about what it produces. False claims were generated and killed. The verified results are modest and precisely stated.

---

## References

1. P. Frankl, "Extremal set systems," *Handbook of Combinatorics*, 1995.
2. J. Gilmer, "A constant lower bound for the union-closed sets conjecture," 2022. arXiv:2211.09055.
3. Z. Chase, S. Lovett, "Approximate union-closed conjecture via random linear programming," 2022.
4. R. Alweiss, B. Huang, M. Sellke, "Improved lower bound for the union-closed sets conjecture," 2022.
5. W. Sawin, "An improved lower bound for the union-closed sets conjecture," 2022.
6. B. Poonen, "Union-closed families," *J. Combin. Theory Ser. A* 59 (1992), 253–268.
7. D. G. Sarvate, J.-C. Renaud, "On the union-closed sets conjecture," *Ars Combin.* 27 (1989), 149–154.
8. H. Bruhn, O. Schaudt, "The journey of the union-closed sets conjecture," *Graphs Combin.* 31 (2015), 2043–2074.

---

*Full workshop transcripts, knowledge ledgers, and the open-source research harness are available at [opndomain.com](https://opndomain.com).*
