import { AnyEntity, EntityType } from '../types';

import glassKnifeData from './entities/object-glass-knife';
import comfortUnitData from './entities/object-comfort-unit';
import museumData from './entities/concept-museum';
import deicideMentorData from './entities/character-deicide-mentor';
import assiTheRunnerData from './entities/character-assi-the-runner';
import masterGideonData from './entities/character-master-gideon';
import medUnit7Data from './entities/character-med-unit-7';
import molotScoutData from './entities/character-molot-scout';
import archQuietusData from './entities/character-arch-quietus';
import magisterSilasData from './entities/character-magister-silas';
import studentMavirData from './entities/character-student-mavir';
import civStudentData from './entities/character-civ-student';
import studentLiraGeneticsData from './entities/character-student-lira_genetics';
import studentKaelenData from './entities/character-student-kaelen';
import telemeCadetData from './entities/character-teleme-cadet';
import supervisorRiggsData from './entities/character-supervisor-riggs';
import legalBot9Data from './entities/character-legal-bot-9';
import sectorAdminBotData from './entities/character-sector-admin-bot';
import moderatorUnit3Data from './entities/character-moderator_unit_3';
import dutyOfficerLandaData from './entities/character-duty-officer-landa';
import curatorIceData from './entities/character-curator-ice';
import auditorTraineeRoData from './entities/character-auditor-trainee-ro';
import techieLinusData from './entities/character-techie-linus';
import elecEliara3Data from './entities/character-elec-eliara3';
import foodCritic88Data from './entities/character-food-critic-88';
import memeSmithData from './entities/character-meme-smith';
import gossipMongerCentralData from './entities/character-gossip-monger_central';
import h2OpsData from './entities/character-h2-ops';
import operatorBrokk7Data from './entities/character-operator-brokk7';
import vigilantCitizenData from './entities/character-vigilant-citizen';
import paranoidPeteData from './entities/character-paranoid-pete';
import commonWorkerDeltaData from './entities/character-common_worker_delta';
import molotTraineeData from './entities/character-molot-trainee';
import commGudokData from './entities/character-comm-gudok';
import caravaneerYusufData from './entities/character-caravaneer-yusuf';
import leilaDaughterOfAdataData from './entities/character-leila-daughter-of-adata';
import forgeWelderIlmData from './entities/character-forge-welder_ilm';
import anonThirtiethData from './entities/character-anon-thirtieth';
import archivistMirrorData from './entities/character-archivist-mirror';

import essenceBlackSun from './entities/essences/essence-black-sun';
import essenceChronicler from './entities/essences/essence-chronicler';
import essenceCorona from './entities/essences/essence-corona';
import essenceEmissary from './entities/essences/essence-emissary';
import essenceFirstLight from './entities/essences/essence-first-light';
import essenceMech from './entities/essences/essence-mech';
import essenceMolot from './entities/essences/essence-molot';
import essenceRector from './entities/essences/essence-rector';
import essenceRegnum from './entities/essences/essence-regnum';
import essenceRhiannon from './entities/essences/essence-rhiannon';


export const allEntities: AnyEntity[] = [
  glassKnifeData,
  comfortUnitData,
  museumData,
  deicideMentorData,
  assiTheRunnerData,
  masterGideonData,
  medUnit7Data,
  molotScoutData,
  archQuietusData,
  magisterSilasData,
  studentMavirData,
  civStudentData,
  studentLiraGeneticsData,
  studentKaelenData,
  telemeCadetData,
  supervisorRiggsData,
  legalBot9Data,
  sectorAdminBotData,
  moderatorUnit3Data,
  dutyOfficerLandaData,
  curatorIceData,
  auditorTraineeRoData,
  techieLinusData,
  elecEliara3Data,
  foodCritic88Data,
  memeSmithData,
  gossipMongerCentralData,
  h2OpsData,
  operatorBrokk7Data,
  vigilantCitizenData,
  paranoidPeteData,
  commonWorkerDeltaData,
  molotTraineeData,
  commGudokData,
  caravaneerYusufData,
  leilaDaughterOfAdataData,
  forgeWelderIlmData,
  anonThirtiethData,
  archivistMirrorData,
  // Essences
  essenceBlackSun,
  essenceChronicler,
  essenceCorona,
  essenceEmissary,
  essenceFirstLight,
  essenceMech,
  essenceMolot,
  essenceRector,
  essenceRegnum,
  essenceRhiannon,
];

export const entityMap: Map<string, AnyEntity> = new Map(
  allEntities.map(e => [e.entityId, e])
);

const entityTypeMap: Map<EntityType, AnyEntity[]> = new Map();
allEntities.forEach(e => {
  if (!entityTypeMap.has(e.type)) {
    entityTypeMap.set(e.type, []);
  }
  entityTypeMap.get(e.type)!.push(e);
});

export const getEntities = (): AnyEntity[] => allEntities;
export const getEntityById = (id: string): AnyEntity | undefined => entityMap.get(id);
export const getEntitiesByType = (type: EntityType): AnyEntity[] => entityTypeMap.get(type) || [];
