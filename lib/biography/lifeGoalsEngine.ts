
import { PersonalEvent } from '../../types';

export interface BiographyLatent {
  traumaSelf: number;
  traumaOthers: number;
  traumaWorld: number;
  traumaSystem: number;
  socialBondPositive: number;
  socialLossNegative: number;
  betrayalLeader: number;
  betrayalPeer: number;
  leadershipEpisodes: number;
  subordinationEpisodes: number;
  rescueSuccess: number;
  rescueFailure: number;
}

export function computeBiographyLatent(events: PersonalEvent[] | undefined): BiographyLatent {
  const latent: BiographyLatent = {
    traumaSelf: 0, traumaOthers: 0, traumaWorld: 0, traumaSystem: 0,
    socialBondPositive: 0, socialLossNegative: 0,
    betrayalLeader: 0, betrayalPeer: 0,
    leadershipEpisodes: 0, subordinationEpisodes: 0,
    rescueSuccess: 0, rescueFailure: 0,
  };

  if (!events) return latent;

  const LAMBDA = 0.15; // Decay factor

  for (const ev of events) {
    const age = ev.years_ago ?? 0;
    const decay = Math.exp(-LAMBDA * age);
    const intensity = (ev.intensity ?? 0) * decay;
    const tags = ev.tags || [];

    if (ev.trauma) {
      const w = (ev.trauma.severity ?? 0) * intensity;
      if (ev.trauma.domain === 'self') latent.traumaSelf += w;
      if (ev.trauma.domain === 'others') latent.traumaOthers += w;
      if (ev.trauma.domain === 'world') latent.traumaWorld += w;
      if (ev.trauma.domain === 'system') latent.traumaSystem += w;
      
      if (ev.trauma.kind === 'betrayal_by_leader') latent.betrayalLeader += w;
      if (ev.trauma.kind === 'betrayal_by_peer') latent.betrayalPeer += w;
      if (ev.trauma.kind === 'failed_rescue') latent.rescueFailure += w;
    }

    if (tags.includes('social')) {
       if (ev.valence > 0) latent.socialBondPositive += intensity;
       else latent.socialLossNegative += intensity;
    }
    
    if (tags.includes('leadership') || tags.includes('command')) latent.leadershipEpisodes += intensity;
    if (tags.includes('subordinate') || tags.includes('obedience')) latent.subordinationEpisodes += intensity;
    
    if (tags.includes('successful_rescue')) latent.rescueSuccess += intensity;
  }
  
  return latent;
}
