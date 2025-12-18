// /lib/registry/signatures.ts
// Λ(action, goal) ∈ [0,1]
export function goalSig(actionId:string, goalIdx:number){
  // goals: [reach_surface, maintain_legitimacy, aid_wounded, comply_now]
  const G = [
    { observe:0.25, share_information:0.55, persuade:0.65, intimidate:0.15, deceive:0.05, introduce:0.10, ask_question:0.40, share_personal_belief:0.35 },
    { observe:0.20, share_information:0.40, persuade:0.50, intimidate:0.20, deceive:0.05, introduce:0.25, ask_question:0.30, share_personal_belief:0.30 },
    { observe:0.20, share_information:0.35, persuade:0.40, intimidate:0.10, deceive:0.00, introduce:0.20, ask_question:0.25, share_personal_belief:0.45 },
    { observe:0.10, share_information:0.10, persuade:0.20, intimidate:0.65, deceive:0.25, introduce:0.10, ask_question:0.10, share_personal_belief:0.05 },
  ];
  const g = G[goalIdx] || {};
  return (g as any)[actionId as keyof typeof g] ?? 0.10;
}