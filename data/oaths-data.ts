
import { Oath } from '../types';

export const sacredSetPresets = [
    { act: 'profane', obj: 'topology.ritual_site' },
    { act: 'erase', obj: 'memory.chronicle' },
    { act: 'fabricate', obj: 'evidence.witness' },
    { act: 'harm', obj: 'people.noncombatant' },
    { act: 'expose', obj: 'information.dark', limit: 'resources.dark_quota' },
    { act: 'breach', obj: 'bio.hresh_containment' },
    { act: 'override', obj: 'authority.oath' },
    { act: 'weaponize', obj: 'causality.dag' },
    { act: 'impersonate', obj: 'authority.signature' },
    { act: 'abandon', obj: 'people.prisoner' },
];

export const oathTemplates: (Oath & { description: string })[] = [
    { key: 'o.chronicle.integrity', description: 'Не искажать/не стирать memory.chronicle без co_sign≥θ и audit_pass.' },
    { key: 'o.witness.provenance', description: 'Всегда указывать степень уверенности и цепочку владения артефактом.' },
    { key: 'o.causal.counterfactual', description: 'Не добавлять рёбра в DAG без эксперимента/контрфактуала уровня k.' },
    { key: 'o.topology.ritual', description: 'Не вмешиваться в topology.node без ритуала R и стража S.' },
    { key: 'o.noncombatant.harm_minimization', description: 'Минимизировать вред people.noncombatant; при конфликте — применять правило X.' },
    { key: 'o.cosign.mandate', description: 'Не исполнять мандаты класса M без ко-подписей ролей R.' },
    { key: 'o.dark.quota', description: 'Не превышать личную квоту dark_quota и не делиться за пределы clearance.' },
    { key: 'o.humane.interrogation', description: 'Запрет на пытки/принуждение показаний.' },
    { key: 'o.resource.lifeline', description: 'Не изымать lifeline-ресурсы без объявленного режима Y.' },
    { key: 'o.sovereignty.treaty', description: 'Не нарушать внешние договоры класса T без решения уровня L.' },
    // Targeted Oaths
    { key: 'serve_lord', description: 'Служить господину (требует Target ID)', targetId: 'character-tegan-nots', level: 'unbreakable' },
    { key: 'protect_kin', description: 'Защищать родича любой ценой', targetId: '', level: 'strong' },
];

export const hardCapPresets = [
    { key: 'dose.range', description: 'dose ∉ [0.8, 1.2] → severity: fatal' },
    { key: 'pr_monstro.domain', description: 'PrMonstro > p* && domain in [\'dark\',\'causal\']' },
    { key: 'clearance.domain', description: 'clearance < required(domain)' },
    { key: 'topo_affinity.threshold', description: 'topo_affinity < τ' },
    { key: 'apophenia.threshold', description: 'A_apoph > φ*' },
    { key: 'cosign.threshold', description: 'co_sign < threshold(mandate)' },
    { key: 'hresh.state', description: 'hresh_state != "contained"' },
    { key: 'oath.violation', description: 'oath_violation == true' },
];
