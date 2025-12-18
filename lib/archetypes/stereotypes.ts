// lib/archetypes/stereotypes.ts

interface ArchetypeStereotype {
    name: string;
    trust: number;  // [0, 1]
    threat: number; // [0, 1]
    // In a future version, this could include default goal estimations
}

// Defines the stereotypical perception of each of the 9 core archetypes.
// The order matches METRIC_NAMES in lib/archetypes/metrics.ts:
// 0: AGENCY, 1: ACCEPT, 2: ACTION, 3: RADICAL, 4: SCOPE, 5: TRUTH, 6: CARE, 7: MANIP, 8: FORMAL
export const ARCHETYPE_STEREOTYPES: ArchetypeStereotype[] = [
    // 0: AGENCY (Subjektivnost) - Seen as capable but potentially self-interested.
    { name: 'AGENCY', trust: 0.5, threat: 0.5 },
    
    // 1: ACCEPT (Priyatie) - Seen as reliable and non-threatening.
    { name: 'ACCEPT', trust: 0.8, threat: 0.2 },
    
    // 2: ACTION (Deystvie) - Seen as proactive but potentially reckless.
    { name: 'ACTION', trust: 0.6, threat: 0.4 },
    
    // 3: RADICAL (Radikalnost) - Seen as untrustworthy and highly threatening to the status quo.
    { name: 'RADICAL', trust: 0.2, threat: 0.9 },
    
    // 4: SCOPE (Masshtab) - Seen as ambitious and potentially threatening due to scale of plans.
    { name: 'SCOPE', trust: 0.4, threat: 0.7 },
    
    // 5: TRUTH (Istina) - Seen as very trustworthy but potentially naive.
    { name: 'TRUTH', trust: 0.9, threat: 0.1 },
    
    // 6: CARE (Zabota) - Seen as highly trustworthy and non-threatening.
    { name: 'CARE', trust: 0.9, threat: 0.1 },
    
    // 7: MANIP (Manipulyatsiya) - Seen as highly untrustworthy and threatening.
    { name: 'MANIP', trust: 0.1, threat: 0.8 },
    
    // 8: FORMAL (Formalizm) - Seen as trustworthy within the system, but rigid.
    { name: 'FORMAL', trust: 0.7, threat: 0.3 },
];
