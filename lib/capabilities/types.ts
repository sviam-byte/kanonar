
export type Capability =
  | 'key_basic'
  | 'key_security'
  | 'clearance_low'
  | 'clearance_mid'
  | 'clearance_high'
  | 'can_command'
  | 'can_arrest'
  | 'can_use_weapon'
  | 'medical_training'
  | 'engineering_training';

export type CapabilityProfile = {
  schemaVersion: number;
  caps: Record<Capability, number>; // 0..1
};
