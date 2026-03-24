# References: Skill Orchestrator & SkillOrchestra

## Primary paper
- **SkillOrchestra: Learning to Route Agents via Skill Transfer**  
  Wang et al., arXiv:2602.19672 (Feb 2026).  
  - [arXiv abstract](https://arxiv.org/abs/2602.19672)  
  - [arXiv PDF](https://arxiv.org/pdf/2602.19672) (figures and tables)  
  - [GitHub](https://github.com/jiayuww/SkillOrchestra) (code “released in 2 weeks” per README)

## Summaries & reviews
- [Emergent Mind – SkillOrchestra](https://www.emergentmind.com/papers/2602.19672) – Summary, glossary, practical applications, knowledge gaps  
- [Liner Quick Review](https://liner.com/review/skillorchestra-learning-to-route-agents-via-skill-transfer) – RQs, main results, method overview  
- [Hugging Face – Paper](https://huggingface.co/papers/2602.19672)

## Related work (from paper / Emergent Mind)
- **Router-R1** [zhang2025routerr] – PPO-trained multi-turn router (RL baseline)  
- **ToolOrchestra** [Su et al., 2511.21689] – Model and tool orchestration  
- **SkillRL** (2602.08234) – Recursive skill-augmented RL  
- **CASTER** (2601.19793) – Context-aware task-efficient routing  
- **SoK: Agentic Skills** (2602.20867) – Skills vs tools terminology

## Benchmarks (paper)
- QA: HotpotQA, 2WikiMultiHopQA, Musique, Bamboogle  
- Math/reasoning: (see paper Table 1)  
- Ten benchmarks total for model routing and agent orchestration

## Figures in paper (see PDF)
- **Figure 1**: Model routing vs direct agent orchestration vs skill-aware orchestration  
- **Figure 2**: Left – routing collapse (Router-R1); Right – handbook transfer  
- **Figure 3**: SkillOrchestra architecture (handbook build → Pareto selection → deployment)  
- **Figure 4**: Skill Handbook instantiation (modes, skill registry, agent profiles)  
- **Figure 5**: Performance–cost tradeoffs (Pareto frontier)  
- **Table 1**: QA dataset results (accuracy by method)
